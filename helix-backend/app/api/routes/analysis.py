"""
Analysis API routes — Phases 5, 6, 7, 9.

Endpoints:
  POST /api/v1/analysis/security/{repo_id}   — run security scan
  GET  /api/v1/analysis/security/{repo_id}   — list findings
  POST /api/v1/analysis/smells/{repo_id}     — run smell detection
  GET  /api/v1/analysis/smells/{repo_id}     — list smells
  POST /api/v1/analysis/health/{repo_id}     — compute health score
  GET  /api/v1/analysis/health/{repo_id}     — get latest health score
  POST /api/v1/analysis/impact               — compute blast radius

curl examples:
  curl -X POST http://localhost:8001/api/v1/analysis/security/<repo_id>
  curl http://localhost:8001/api/v1/analysis/security/<repo_id>
  curl -X POST http://localhost:8001/api/v1/analysis/smells/<repo_id>
  curl -X POST http://localhost:8001/api/v1/analysis/health/<repo_id>
  curl http://localhost:8001/api/v1/analysis/health/<repo_id>
  curl -X POST http://localhost:8001/api/v1/analysis/impact \
    -H "Content-Type: application/json" \
    -d '{"repo_id":"...","node_id":"operations.py::borrow_book::9","node_type":"function"}'
"""
import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.analysis.health_scorer import HealthScorer
from app.core.analysis.impact_analyzer import ImpactAnalyzer
from app.core.analysis.security_analyzer import SecurityAnalyzer
from app.core.analysis.smell_detector import SmellDetector
from app.db.postgres import CodeSmell, HealthScore, SecurityFinding, get_db

logger = logging.getLogger("helix.api.analysis")
router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class ImpactRequest(BaseModel):
    repo_id: str
    node_id: str
    node_type: str = "function"  # "file" | "function"


class SecurityFindingOut(BaseModel):
    id: str
    severity: str
    file_path: str
    line_number: Optional[int]
    issue_type: str
    description: str
    suggestion: str

    class Config:
        from_attributes = True


class CodeSmellOut(BaseModel):
    id: str
    smell_type: str
    severity: str
    node_name: str
    file_path: str
    description: str
    suggestion: str

    class Config:
        from_attributes = True


class HealthScoreOut(BaseModel):
    repo_id: str
    overall_score: float
    architecture_score: float
    maintainability_score: float
    complexity_score: float
    security_score: float
    performance_score: float
    documentation_score: float
    breakdown: Optional[dict]

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Security endpoints
# ---------------------------------------------------------------------------

@router.post("/security/{repo_id}", summary="Run security scan")
async def run_security_scan(repo_id: str, db: AsyncSession = Depends(get_db)):
    """
    Scans all source files in the repository for:
    hardcoded secrets, SQL injection, XSS, unsafe imports, weak auth.
    """
    analyzer = SecurityAnalyzer(repo_id=repo_id, db=db)
    try:
        findings = await analyzer.analyze()
    except Exception as exc:
        logger.exception("Security scan failed for repo %s", repo_id)
        raise HTTPException(status_code=500, detail=str(exc))

    summary: dict = {}
    for f in findings:
        summary[f.severity] = summary.get(f.severity, 0) + 1

    return {
        "repo_id": repo_id,
        "total_findings": len(findings),
        "summary": summary,
        "findings": [
            {
                "severity": f.severity,
                "file_path": f.file_path,
                "line_number": f.line_number,
                "issue_type": f.issue_type,
                "description": f.description,
                "suggestion": f.suggestion,
            }
            for f in findings
        ],
    }


@router.get("/security/{repo_id}", response_model=List[SecurityFindingOut])
async def get_security_findings(repo_id: str, db: AsyncSession = Depends(get_db)):
    """Return all stored security findings for a repository."""
    result = await db.execute(
        select(SecurityFinding).where(SecurityFinding.repo_id == repo_id)
        .order_by(SecurityFinding.severity, SecurityFinding.file_path)
    )
    rows = result.scalars().all()
    return [
        SecurityFindingOut(
            id=str(r.id),
            severity=r.severity,
            file_path=r.file_path,
            line_number=r.line_number,
            issue_type=r.issue_type,
            description=r.description,
            suggestion=r.suggestion,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Code smell endpoints
# ---------------------------------------------------------------------------

@router.post("/smells/{repo_id}", summary="Run code smell detection")
async def run_smell_detection(repo_id: str, db: AsyncSession = Depends(get_db)):
    """
    Detects: God Classes, Long Methods, Circular Dependencies,
    Dead Code, and Duplicate Logic via Neo4j graph queries.
    """
    detector = SmellDetector(repo_id=repo_id, db=db)
    try:
        smells = await detector.detect()
    except Exception as exc:
        logger.exception("Smell detection failed for repo %s", repo_id)
        raise HTTPException(status_code=500, detail=str(exc))

    summary: dict = {}
    for s in smells:
        summary[s.smell_type] = summary.get(s.smell_type, 0) + 1

    return {
        "repo_id": repo_id,
        "total_smells": len(smells),
        "summary": summary,
        "smells": [
            {
                "smell_type": s.smell_type,
                "severity": s.severity,
                "node_name": s.node_name,
                "file_path": s.file_path,
                "description": s.description,
                "suggestion": s.suggestion,
            }
            for s in smells
        ],
    }


@router.get("/smells/{repo_id}", response_model=List[CodeSmellOut])
async def get_code_smells(repo_id: str, db: AsyncSession = Depends(get_db)):
    """Return all stored code smells for a repository."""
    result = await db.execute(
        select(CodeSmell).where(CodeSmell.repo_id == repo_id)
        .order_by(CodeSmell.smell_type)
    )
    rows = result.scalars().all()
    return [
        CodeSmellOut(
            id=str(r.id),
            smell_type=r.smell_type,
            severity=r.severity,
            node_name=r.node_name,
            file_path=r.file_path,
            description=r.description,
            suggestion=r.suggestion,
        )
        for r in rows
    ]


# ---------------------------------------------------------------------------
# Health score endpoints
# ---------------------------------------------------------------------------

@router.post("/health/{repo_id}", summary="Compute project health score")
async def compute_health_score(repo_id: str, db: AsyncSession = Depends(get_db)):
    """
    Aggregates security findings and code smells to produce an overall
    health score (0-100) and 6 sub-scores.

    Note: run security scan and smell detection first for best results.
    """
    scorer = HealthScorer(repo_id=repo_id, db=db)
    try:
        report = await scorer.score()
    except Exception as exc:
        logger.exception("Health scoring failed for repo %s", repo_id)
        raise HTTPException(status_code=500, detail=str(exc))

    return {
        "repo_id": repo_id,
        "overall_score": report.overall,
        "grade": _grade(report.overall),
        "scores": {
            "architecture": report.architecture,
            "maintainability": report.maintainability,
            "complexity": report.complexity,
            "security": report.security,
            "performance": report.performance,
            "documentation": report.documentation,
        },
        "breakdown": report.breakdown,
    }


@router.get("/health/{repo_id}", summary="Get latest health score")
async def get_health_score(repo_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(HealthScore).where(HealthScore.repo_id == repo_id)
        .order_by(HealthScore.created_at.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="No health score found. Run POST /health/{repo_id} first.")

    breakdown = json.loads(row.breakdown) if row.breakdown else {}
    return {
        "repo_id": row.repo_id,
        "overall_score": row.overall_score,
        "grade": _grade(row.overall_score),
        "scores": {
            "architecture": row.architecture_score,
            "maintainability": row.maintainability_score,
            "complexity": row.complexity_score,
            "security": row.security_score,
            "performance": row.performance_score,
            "documentation": row.documentation_score,
        },
        "breakdown": breakdown,
        "computed_at": row.created_at.isoformat(),
    }


# ---------------------------------------------------------------------------
# Impact analysis endpoint
# ---------------------------------------------------------------------------

@router.post("/impact", summary="Compute blast radius for a node")
async def compute_impact(payload: ImpactRequest):
    """
    Given a file path or function ID, returns all nodes that would be
    affected if it changed (up to 3 hops), a risk score, any API
    endpoints in the blast radius, and a Groq-generated plain-English
    summary.
    """
    if payload.node_type.lower() not in ("file", "function"):
        raise HTTPException(status_code=400, detail="node_type must be 'file' or 'function'.")

    analyzer = ImpactAnalyzer(repo_id=payload.repo_id)
    try:
        report = await analyzer.analyze(payload.node_id, payload.node_type)
    except Exception as exc:
        logger.exception("Impact analysis failed for node %s", payload.node_id)
        raise HTTPException(status_code=500, detail=str(exc))

    return {
        "source_node_id": report.source_node_id,
        "risk_score": report.risk_score,
        "total_affected": len(report.affected_nodes),
        "broken_endpoints": report.broken_endpoints,
        "summary": report.summary,
        "affected_nodes": [
            {
                "node_id": n.node_id,
                "name": n.name,
                "type": n.node_type,
                "file_path": n.file_path,
                "depth": n.depth,
            }
            for n in report.affected_nodes
        ],
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _grade(score: float) -> str:
    if score >= 90:
        return "A"
    if score >= 80:
        return "B"
    if score >= 70:
        return "C"
    if score >= 60:
        return "D"
    return "F"
