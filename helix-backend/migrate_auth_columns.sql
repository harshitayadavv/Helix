-- Run this ONCE against your helix_db to add the new auth columns.
-- Safe to run even if columns already exist (IF NOT EXISTS).

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS email          VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS password_hash  VARCHAR(256);

CREATE INDEX IF NOT EXISTS ix_api_keys_email ON api_keys (email);

-- Also create the tables added in phases 11-15 if they don't exist yet.
CREATE TABLE IF NOT EXISTS git_commits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id        VARCHAR(64) NOT NULL,
  commit_hash    VARCHAR(64) NOT NULL,
  author_name    VARCHAR(255),
  author_email   VARCHAR(255),
  message        TEXT,
  files_changed  TEXT,
  insertions     INTEGER DEFAULT 0,
  deletions      INTEGER DEFAULT 0,
  committed_at   TIMESTAMP,
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_git_commits_repo_id ON git_commits (repo_id);

CREATE TABLE IF NOT EXISTS performance_issues (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_id        VARCHAR(64) NOT NULL,
  pattern_type   VARCHAR(128) NOT NULL,
  severity       VARCHAR(16)  NOT NULL,
  file_path      VARCHAR(1024) NOT NULL,
  function_name  VARCHAR(512) NOT NULL,
  line_number    INTEGER,
  description    TEXT NOT NULL,
  suggestion     TEXT NOT NULL,
  created_at     TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_performance_issues_repo_id ON performance_issues (repo_id);

CREATE TABLE IF NOT EXISTS request_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_prefix   VARCHAR(10),
  endpoint         VARCHAR(512) NOT NULL,
  method           VARCHAR(10)  NOT NULL,
  status_code      INTEGER,
  response_time_ms FLOAT,
  created_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_request_logs_api_key_prefix ON request_logs (api_key_prefix);
CREATE INDEX IF NOT EXISTS ix_request_logs_created_at     ON request_logs (created_at);
