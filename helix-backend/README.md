# Helix — AI Code Intelligence Platform (Backend)

FastAPI backend that ingests a codebase, parses it with tree-sitter,
builds a knowledge graph in Neo4j, indexes code semantically with
FAISS, and answers natural-language questions about the codebase via
a LangGraph agent running on Groq's `llama-3.3-70b-versatile`.

## Stack

- **API**: FastAPI (async), WebSockets for live progress
- **Graph DB**: Neo4j (File / Function / Class / Module nodes; CONTAINS / CALLS / INHERITS / IMPORTS edges)
- **Relational DB**: PostgreSQL (repository ingestion state)
- **Queue**: Redis + Celery (background ingestion pipeline)
- **AI**: LangGraph + Groq (`llama-3.3-70b-versatile`) + sentence-transformers + FAISS
- **Parsing**: tree-sitter (Python, JavaScript, TypeScript, Java, C++)

## Project layout

See `STRUCTURE.md` (or the tree at the bottom of the task response) for
the full directory layout.

## Getting started

```bash
cp .env.example .env
# edit .env and set GROQ_API_KEY at minimum

docker compose up -d neo4j postgres redis
pip install -r requirements.txt

# terminal 1 — API
uvicorn app.main:app --reload

# terminal 2 — Celery worker
celery -A celery_worker.celery_app worker --loglevel=info
```

Or run everything in containers:

```bash
docker compose up --build
```

- API: http://localhost:8000 (docs at `/docs`)
- Neo4j browser: http://localhost:7474
- WebSocket progress channel: `ws://localhost:8000/ws/{repo_id}`

## Typical flow

1. `POST /api/v1/repositories/upload` with a `.zip` of a codebase → returns a `repo_id`.
2. Connect to `ws://localhost:8000/ws/{repo_id}` to watch live ingestion progress.
3. Once `status = completed`:
   - `GET /api/v1/graph/{repo_id}/nodes` / `/relationships` to explore the graph.
   - `GET /api/v1/search?repo_id=...&q=...` for hybrid semantic search.
   - `POST /api/v1/ai/ask` with `{ "repo_id": ..., "question": ... }` to ask the agent.

## Notes

- `GROQ_API_KEY` must be set for the `/api/v1/ai/ask` endpoint to work.
- The Cypher `query_graph` tool and the `/graph/{repo_id}/query` endpoint
  reject any write keywords (`CREATE`, `MERGE`, `DELETE`, `SET`, `DROP`,
  `REMOVE`, `DETACH`) as a safety guard against destructive queries.
- Use Alembic for schema migrations in production instead of relying on
  `init_db()`'s `create_all`.
