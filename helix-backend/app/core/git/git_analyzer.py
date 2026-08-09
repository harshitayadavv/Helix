"""
Phase 11 — Git Analyzer

Uses GitPython to:
  - Clone a public GitHub repository by URL
  - Extract full git log (commits, authors, timestamps, files changed)
  - Identify hotspot files (most frequently changed)
  - Build contributor graph (who touches which files most)

Git data is stored in the `git_commits` PostgreSQL table.

curl examples:
  POST /api/v1/repositories/clone
    body: {"github_url": "https://github.com/user/repo", "branch": "main"}

  GET /api/v1/repositories/{repo_id}/commits?limit=20&offset=0
  GET /api/v1/repositories/{repo_id}/hotspots
  GET /api/v1/repositories/{repo_id}/contributors
"""
import json
import logging
import os
import shutil
import uuid
from collections import defaultdict
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple

from git import GitCommandError, InvalidGitRepositoryError, Repo
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db.postgres import GitCommit

logger = logging.getLogger("helix.git_analyzer")

# Max commits to analyse (keeps memory bounded on large repos)
MAX_COMMITS = 50


@dataclass
class CommitInfo:
    commit_hash: str
    author_name: str
    author_email: str
    message: str
    files_changed: List[str]
    insertions: int
    deletions: int
    committed_at: datetime


@dataclass
class HotspotFile:
    path: str
    change_count: int
    unique_authors: int


@dataclass
class Contributor:
    name: str
    email: str
    commit_count: int
    owned_files: List[str] = field(default_factory=list)  # files touched most by this author


class GitAnalyzer:
    """Clones / inspects a git repository and stores its history."""

    def __init__(self, repo_id: str, db: AsyncSession) -> None:
        self.repo_id = repo_id
        self.db = db
        self._clone_dir = Path(settings.REPO_STORAGE_PATH) / repo_id / "git"

    # ------------------------------------------------------------------
    # Clone
    # ------------------------------------------------------------------

    @staticmethod
    def _is_branch_not_found(exc: GitCommandError) -> bool:
        text = str(exc).lower()
        return "not found in upstream" in text or (
            "remote branch" in text and "not found" in text
        )

    async def clone(self, github_url: str, branch: str = "main") -> str:
        """
        Clone a public GitHub repo and return the local path.
        Raises ValueError on invalid URL or clone failure.

        Tries `branch` first (this covers both an explicit user choice
        and the "main" default). If that specific branch doesn't exist
        on the remote — the most common failure, since many repos still
        default to "master" — automatically retries with no branch
        argument at all, which makes git clone whatever the remote's
        actual default branch is instead of forcing a guess.
        """
        import asyncio

        if not github_url.startswith(("https://github.com", "https://gitlab.com",
                                      "https://bitbucket.org")):
            raise ValueError("Only public GitHub / GitLab / Bitbucket URLs are supported.")

        self._clone_dir.mkdir(parents=True, exist_ok=True)
        logger.info("Cloning %s (branch=%s) → %s", github_url, branch, self._clone_dir)

        try:
            await asyncio.to_thread(
                Repo.clone_from,
                github_url,
                self._clone_dir.as_posix(),
                branch=branch,
                depth=MAX_COMMITS,      # shallow clone keeps it fast
                single_branch=True,
            )
        except GitCommandError as exc:
            if not self._is_branch_not_found(exc):
                raise ValueError(f"Git clone failed: {exc}") from exc

            logger.info(
                "Branch '%s' not found on %s, retrying with the repository's default branch",
                branch, github_url,
            )
            shutil.rmtree(self._clone_dir, ignore_errors=True)
            self._clone_dir.mkdir(parents=True, exist_ok=True)

            try:
                await asyncio.to_thread(
                    Repo.clone_from,
                    github_url,
                    self._clone_dir.as_posix(),
                    depth=MAX_COMMITS,   # no `branch=` — clones the remote's actual default
                    single_branch=True,
                )
            except GitCommandError as exc2:
                raise ValueError(f"Git clone failed: {exc2}") from exc2

        return self._clone_dir

    # ------------------------------------------------------------------
    # Log extraction
    # ------------------------------------------------------------------

    async def extract_commits(self) -> List[CommitInfo]:
        """Walk the git log and return a list of CommitInfo objects."""
        import asyncio
        return await asyncio.to_thread(self._extract_commits_sync)

    def _extract_commits_sync(self) -> List[CommitInfo]:
        try:
            repo = Repo(self._clone_dir)
        except InvalidGitRepositoryError:
            logger.error("Not a valid git repository: %s", self._clone_dir)
            return []

        commits: List[CommitInfo] = []
        for commit in repo.iter_commits(max_count=MAX_COMMITS):
            try:
                # Files changed (stats only available when there is a parent)
                files_changed: List[str] = []
                insertions = 0
                deletions = 0
                if commit.parents:
                    diff = commit.parents[0].diff(commit)
                    files_changed = [d.b_path or d.a_path for d in diff if d.b_path or d.a_path]
                    stats = commit.stats
                    insertions = stats.total.get("insertions", 0)
                    deletions = stats.total.get("deletions", 0)

                commits.append(CommitInfo(
                    commit_hash=commit.hexsha,
                    author_name=commit.author.name or "",
                    author_email=commit.author.email or "",
                    message=(commit.message or "").strip()[:500],
                    files_changed=files_changed,
                    insertions=insertions,
                    deletions=deletions,
                    committed_at=datetime.fromtimestamp(commit.committed_date),
                ))
            except Exception:
                logger.debug("Skipping malformed commit %s", commit.hexsha[:8])

        return commits

    # ------------------------------------------------------------------
    # Persist + analytics
    # ------------------------------------------------------------------

    async def persist_commits(self, commits: List[CommitInfo]) -> None:
        await self.db.execute(delete(GitCommit).where(GitCommit.repo_id == self.repo_id))
        await self.db.commit()

        for c in commits:
            self.db.add(GitCommit(
                id=uuid.uuid4(),
                repo_id=self.repo_id,
                commit_hash=c.commit_hash,
                author_name=c.author_name,
                author_email=c.author_email,
                message=c.message,
                files_changed=json.dumps(c.files_changed),
                insertions=c.insertions,
                deletions=c.deletions,
                committed_at=c.committed_at,
            ))
        await self.db.commit()
        logger.info("Persisted %d commits for repo %s", len(commits), self.repo_id)

    # ------------------------------------------------------------------
    # Query helpers (used by API routes)
    # ------------------------------------------------------------------

    async def get_commits_paginated(
        self, limit: int = 20, offset: int = 0
    ) -> Tuple[List[dict], int]:
        result = await self.db.execute(
            select(GitCommit)
            .where(GitCommit.repo_id == self.repo_id)
            .order_by(GitCommit.committed_at.desc())
            .limit(limit)
            .offset(offset)
        )
        rows = result.scalars().all()

        count_result = await self.db.execute(
            select(GitCommit).where(GitCommit.repo_id == self.repo_id)
        )
        total = len(count_result.scalars().all())

        commits = [
            {
                "commit_hash": r.commit_hash,
                "author": r.author_name,
                "email": r.author_email,
                "message": r.message,
                "files_changed": json.loads(r.files_changed or "[]"),
                "insertions": r.insertions,
                "deletions": r.deletions,
                "committed_at": r.committed_at.isoformat() if r.committed_at else None,
            }
            for r in rows
        ]
        return commits, total

    async def get_hotspots(self, top_n: int = 10) -> List[HotspotFile]:
        """Return the top N files by change frequency."""
        result = await self.db.execute(
            select(GitCommit).where(GitCommit.repo_id == self.repo_id)
        )
        commits = result.scalars().all()

        file_counts: Dict[str, int] = defaultdict(int)
        file_authors: Dict[str, set] = defaultdict(set)

        for c in commits:
            files = json.loads(c.files_changed or "[]")
            for f in files:
                file_counts[f] += 1
                file_authors[f].add(c.author_email)

        sorted_files = sorted(file_counts.items(), key=lambda x: x[1], reverse=True)
        return [
            HotspotFile(
                path=path,
                change_count=count,
                unique_authors=len(file_authors[path]),
            )
            for path, count in sorted_files[:top_n]
        ]

    async def get_contributors(self) -> List[Contributor]:
        """Return contributor list with the files each person touches most."""
        result = await self.db.execute(
            select(GitCommit).where(GitCommit.repo_id == self.repo_id)
        )
        commits = result.scalars().all()

        author_commits: Dict[str, dict] = {}
        author_files: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

        for c in commits:
            key = c.author_email or c.author_name or "unknown"
            if key not in author_commits:
                author_commits[key] = {
                    "name": c.author_name,
                    "email": c.author_email,
                    "count": 0,
                }
            author_commits[key]["count"] += 1
            for f in json.loads(c.files_changed or "[]"):
                author_files[key][f] += 1

        contributors = []
        for key, info in author_commits.items():
            # "Owned" files = files this contributor changed more than anyone else
            top_files = sorted(
                author_files[key].items(), key=lambda x: x[1], reverse=True
            )[:5]
            contributors.append(Contributor(
                name=info["name"],
                email=info["email"],
                commit_count=info["count"],
                owned_files=[f for f, _ in top_files],
            ))

        return sorted(contributors, key=lambda c: c.commit_count, reverse=True)

    def cleanup(self) -> None:
        if os.path.isdir(self._clone_dir):
            shutil.rmtree(self._clone_dir, ignore_errors=True)
