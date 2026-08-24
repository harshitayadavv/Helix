<div align="center">

<img src="https://img.shields.io/badge/Helix-AI%20Code%20Intelligence-6366f1?style=for-the-badge" alt="Helix" />

# Helix — AI Code Intelligence Platform

**Understand, visualize, and reason over any software system.**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![Neo4j](https://img.shields.io/badge/Neo4j-Graph%20DB-008CC1?style=flat-square&logo=neo4j)](https://neo4j.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-Agent-FF6B35?style=flat-square)](https://langchain-ai.github.io/langgraph/)
[![Groq](https://img.shields.io/badge/Groq-LLM%20Inference-F55036?style=flat-square)](https://groq.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

**[🌐 Live Demo](https://helix-phi-beige.vercel.app)** • **[🔌 API Docs](https://helix-iq1l.onrender.com/docs)** • [Features](#-features) • [Architecture](#-architecture) • [Quick Start](#-quick-start) • [Known Limitations](#-known-limitations)

</div>

---

## 🚀 What is Helix?

Modern software projects contain thousands of files, APIs, services, and dependencies. Understanding how a large codebase works is hard — for new developers, reviewers, and even the people who wrote it.

**Helix transforms any codebase into a queryable knowledge graph.** Upload a ZIP or connect a GitHub repo, and Helix parses every file with tree-sitter AST analysis, builds a Neo4j relationship graph, and lets you explore and query your code with natural language.

Unlike RAG-based code assistants that search text, **Helix reasons over structure** — function call graphs, class inheritance, module dependencies, and import chains — giving answers that understand *how* your code actually works.

---

## 🔗 Links

| | |
|---|---|
| 🌐 **Frontend** | https://helix-phi-beige.vercel.app |
| 🔌 **Backend API + Swagger** | https://helix-iq1l.onrender.com/docs |
| 📦 **GitHub** | https://github.com/harshitayadavv/helix |

---

## ✨ Features

### 🔍 Intelligent Repository Analysis
- Upload a ZIP or clone any public GitHub repository (auto-falls back to the repo's actual default branch if the requested one doesn't exist)
- Automatic language detection across Python, JavaScript, TypeScript, Java, C++
- Real-time processing progress via WebSocket streaming
- Per-account repository isolation — each account only sees its own repos

### 🌳 AST & Knowledge Graph
- Full tree-sitter AST parsing per language
- Extracts functions, classes, imports, exports, function calls
- Builds a Neo4j graph with node types: `File`, `Function`, `Class`, `Module`
- Relationships: `CONTAINS`, `CALLS`, `IMPORTS`, `INHERITS`
- Writes are batched per-repository (not per-file), keeping ingestion fast regardless of repo size

### 🎯 Interactive Graph Explorer
- **Radial "mind map" layout** — auto-detects the project's entry point (`main.py`, `App.tsx`, Next.js `layout.tsx`/`page.tsx`, etc.) and arranges every other node in concentric rings by hop-distance, so structure reads clearly instead of collapsing into a wall of nodes
- **Frontend / Backend toggle** — automatically splits a repo's files by path/extension into two independently-laid-out views; a side with no matching files is disabled automatically
- **Click-to-focus** — click any node to narrow the canvas to just that node and its direct connections; click again (or "Show full graph") to zoom back out
- **Path tracing** — select two nodes to trace and highlight the shortest connecting path
- Color-coded, toggleable edge legend (Contains / Calls / Imports / Inherits)
- Zoom controls with a live percentage readout, minimap, node search and filtering

### 🤖 AI Code Assistant
- LangGraph agent backed by a Groq-hosted LLM (configurable via `GROQ_MODEL` — Groq periodically deprecates specific model names, so this is read from environment rather than hardcoded)
- Reasons over the knowledge graph, not just text
- Ask questions like:
  - *"Explain the authentication flow"*
  - *"Where is JWT implemented?"*
  - *"Which files would break if I remove Redis?"*
  - *"Find all dead code"*

### 🔎 Hybrid Semantic Search
- FAISS vector search + Neo4j keyword fallback
- Filter by node type (Function / Class / File / Module) and language
- Search history tracked per repository in Redis
- Semantic (vector) results depend on embeddings having been generated at ingestion time — see [Known Limitations](#-known-limitations)

### ⚠️ Impact Analysis
- Select any file or function → compute blast radius via Neo4j BFS
- Depth 1: direct dependents (red), Depth 2: indirect (orange), Depth 3: transitive (yellow)
- Risk score: Low / Medium / High / Critical
- AI-generated plain-English explanation

### 🛡️ Security Analyzer
- Hardcoded secrets detection (API keys, passwords, tokens)
- SQL injection patterns, XSS vulnerabilities
- Unsafe imports (`eval`, `exec`, `pickle`, `os.system`)
- Weak auth patterns (MD5/SHA1 password hashing)

### 🧩 Code Smell Detection
- God Classes (>10 methods), Long Methods (>50 lines)
- Circular Dependencies (Neo4j cycle detection)
- Dead Code (functions with no incoming `CALLS` edges)
- Duplicate Logic (same function name across files)

### 📊 AI Project Health Score
- Overall score (0–100) with letter grade
- 6 sub-scores: Architecture · Maintainability · Complexity · Security · Performance · Documentation

### ⚡ Performance Analyzer
- N+1 query pattern detection, blocking calls in async functions
- Expensive nested loops, unnecessary object creation in loops

### 📖 Documentation Generator
- AI-generated README, API docs, Architecture overview, Onboarding guide
- Mermaid diagram for module dependencies — copy or download as `.md`

### 🔄 Repository Timeline
- Git log: commits, authors, timestamps, files changed
- Hotspot files + contributor graph

---

## 🏗️ Architecture

```
                    GitHub URL / ZIP Upload
                            │
                            ▼
                   Repository Processor
                    (background task)
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   AST Parser         Dependency Builder    Git Analyzer
  (tree-sitter)      (import resolver)     (GitPython)
        │                   │                   │
        └──────────────┬────┴───────────────────┘
                       ▼
             Knowledge Graph Builder
             (batched writes → Neo4j)
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
 Vector Store*    Search Engine    AI Agents
   (FAISS)       (Hybrid Search)  (LangGraph)
        └──────────────┬──────────────┘
                       ▼
                FastAPI Backend
                       │
               WebSocket Streaming
                       │
                       ▼
          Next.js Interactive Dashboard
```
<sub>* Vector store population is optional and configurable — see Known Limitations.</sub>

---

## 🖥️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS, React Flow, Framer Motion, ShadCN UI |
| **Backend** | FastAPI, Python 3.11, Uvicorn |
| **Graph DB** | Neo4j AuraDB |
| **Relational DB** | PostgreSQL (SQLAlchemy async, `asyncpg`) |
| **Cache / Queue** | Redis |
| **AI Agent** | LangGraph, Groq (model configurable) |
| **Parsing** | tree-sitter (Python, JS, TS, Java, C++) |
| **Embeddings** | sentence-transformers (`all-MiniLM-L6-v2`), toggleable via `ENABLE_EMBEDDINGS` |
| **Vector Search** | FAISS |
| **Git Analysis** | GitPython |
| **Hosting** | Vercel (frontend) · Render (backend) |
| **Infra** | Docker, Docker Compose |

---

## ⚡ Quick Start

### Prerequisites
- Docker + Docker Compose
- Python 3.11 (conda recommended)
- Node.js 18+
- Groq API key (free at [console.groq.com](https://console.groq.com))

### 1. Clone the repo

```bash
git clone https://github.com/harshitayadavv/helix.git
cd helix
```

### 2. Backend setup

```bash
cd helix-backend
cp .env.example .env
# Edit .env — add GROQ_API_KEY, GROQ_MODEL, and NEO4J credentials

docker compose up -d neo4j postgres redis   # start infrastructure

conda create -n helix python=3.11 -y
conda activate helix
pip install -r requirements.txt

uvicorn app.main:app --reload --port 8001
```

### 3. Frontend setup

```bash
cd helix-frontend
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8001
npm install && npm run dev
```

### 4. Open Helix

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API + Swagger | http://localhost:8001/docs |
| Neo4j Browser | http://localhost:7474 |

---

## 📡 API Reference

All endpoints require an `X-API-Key` header after registration.

```bash
# Register
curl -X POST https://helix-iq1l.onrender.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com", "password": "yourpass", "name": "Your Name"}'

# Upload a repository
curl -X POST https://helix-iq1l.onrender.com/api/v1/repositories/upload \
  -H "X-API-Key: your_key" \
  -F "file=@myrepo.zip"

# Clone a repository
curl -X POST https://helix-iq1l.onrender.com/api/v1/repositories/clone \
  -H "X-API-Key: your_key" \
  -H "Content-Type: application/json" \
  -d '{"github_url": "https://github.com/owner/repo", "branch": "main"}'

# Ask the AI
curl -X POST https://helix-iq1l.onrender.com/api/v1/ai/ask \
  -H "X-API-Key: your_key" \
  -H "Content-Type: application/json" \
  -d '{"repo_id": "your_repo_id", "question": "Explain the authentication flow"}'
```

Full docs: **https://helix-iq1l.onrender.com/docs**

---

## 📁 Project Structure

```
helix/
├── helix-backend/
│   ├── app/
│   │   ├── api/routes/       # FastAPI route handlers
│   │   ├── core/
│   │   │   ├── ai/           # LangGraph agent, embeddings, prompts
│   │   │   ├── analysis/     # Security, smells, health, performance, impact
│   │   │   ├── auth/         # Auth handler (bcrypt + API keys)
│   │   │   ├── docs/         # Documentation generator
│   │   │   ├── git/          # Git analyzer (GitPython)
│   │   │   ├── graph/        # Neo4j client, graph builder
│   │   │   ├── parser/       # tree-sitter AST parser
│   │   │   └── search/       # Hybrid FAISS + Neo4j search
│   │   ├── db/                # PostgreSQL + SQLAlchemy
│   │   └── services/          # Repo processor, WebSocket manager
│   └── docker-compose.yml
│
└── helix-frontend/
    └── src/
        ├── app/
        │   ├── repo/[id]/    # Per-repo workspace (graph, chat, search, analysis...)
        │   ├── dashboard/    # Repo list + uploader
        │   └── auth/         # Login + signup
        ├── components/       # Reusable components
        └── lib/              # api.ts, websocket.ts, utils.ts
```

---

## ⚠️ Known Limitations

Helix runs entirely on free-tier infrastructure, which shapes a few behaviors worth knowing about:

- **Neo4j AuraDB (free tier)** auto-pauses after a period of inactivity. A paused instance causes graph-related requests to fail until it's manually resumed from the [Aura console](https://console.neo4j.io).
- **Render PostgreSQL (free tier)** expires 30 days after creation and is deleted 14 days after that unless upgraded — see [Render's docs](https://render.com/docs) for details.
- **Render's free web service tier** cold-starts after inactivity, which can add noticeable latency to the first request after a period of idleness.
- **Embeddings** (`sentence-transformers`) are memory-intensive; on constrained hosting they're gated behind an `ENABLE_EMBEDDINGS` flag. When disabled, semantic search falls back to Neo4j keyword search only.

None of these affect correctness — they're purely artifacts of running on free hosting tiers, and each is one config change or dashboard click away from being resolved on paid infrastructure.

---

## 🗺️ Roadmap

- [ ] Multi-agent architecture reviewer
- [ ] PR review assistant
- [ ] AI Change Simulator
- [ ] VS Code extension
- [ ] Voice interaction
- [ ] Team Knowledge Hub

---

## 👩‍💻 Author

Built by **Harshita Yadav** — B.Tech, IIIT Kota

[![GitHub](https://img.shields.io/badge/GitHub-harshitayadavv-181717?style=flat-square&logo=github)](https://github.com/harshitayadavv)

---

<div align="center">
<sub>Built with ❤️ — Helix is not just a project. It's a platform.</sub>
</div>