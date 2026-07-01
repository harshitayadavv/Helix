'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronDown, FileCode2, Folder, FolderOpen, Copy, Download, Sparkles, Check } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/utils';

const FILE_TREE = [
  { id: '1', name: 'src', type: 'folder' as const, children: [
    { id: '2', name: 'app.py', type: 'file' as const },
    { id: '3', name: 'auth.py', type: 'file' as const },
    { id: '4', name: 'models.py', type: 'file' as const },
    { id: '5', name: 'middleware.py', type: 'file' as const },
    { id: '6', name: 'db', type: 'folder' as const, children: [
      { id: '7', name: 'repo.py', type: 'file' as const },
    ]},
  ]},
  { id: '8', name: 'tests', type: 'folder' as const, children: [
    { id: '9', name: 'test_auth.py', type: 'file' as const },
  ]},
  { id: '10', name: 'requirements.txt', type: 'file' as const },
];

const TABS = ['README', 'API Docs', 'Architecture', 'Onboarding'];

const README_CONTENT = `# helix-backend

A production-ready FastAPI backend with JWT authentication, role-based access control, and a modular service architecture.

## Features
- **JWT Authentication** — Stateless token-based auth with refresh support
- **Role-based access** — Granular permissions via middleware
- **Repository pattern** — Clean data access layer separating business logic from SQL
- **Async-first** — Built on FastAPI with full async/await support

## Quick Start
\`\`\`bash
pip install -r requirements.txt
uvicorn src.app:app --reload
\`\`\`

## Architecture
The codebase follows a layered architecture: Routes → Services → Repository → Database.
Authentication is handled via middleware before requests reach route handlers.

## Project Structure
\`\`\`
src/
  app.py          # FastAPI app factory
  auth.py         # Auth logic and JWT handling
  models.py       # Pydantic schemas
  middleware.py   # Request interceptors
  db/
    repo.py       # Data access layer
\`\`\``;

const API_CONTENT = [
  { method: 'POST', path: '/auth/login', desc: 'Authenticate and receive JWT', params: [{ name: 'username', type: 'string', req: true }, { name: 'password', type: 'string', req: true }], response: '{ token: string, expires_in: number }' },
  { method: 'GET', path: '/users/:id', desc: 'Fetch user profile by ID', params: [{ name: 'id', type: 'string (path)', req: true }], response: '{ id, name, email, role }' },
  { method: 'PUT', path: '/users/:id', desc: 'Update user profile', params: [{ name: 'id', type: 'string (path)', req: true }, { name: 'name', type: 'string', req: false }], response: '{ id, name, email }' },
  { method: 'POST', path: '/payments/charge', desc: 'Process a payment charge', params: [{ name: 'amount', type: 'number', req: true }, { name: 'currency', type: 'string', req: true }], response: '{ charge_id, status }' },
];

const ARCH_CONTENT = `## Architecture Overview

helix-backend follows a clean layered architecture designed for testability and maintainability.

### Layers
1. **Routes** — FastAPI route handlers. Thin wrappers that delegate to services.
2. **Services** — Business logic. Stateless classes injected via FastAPI Depends.
3. **Repository** — Data access. All SQL lives here, nowhere else.
4. **Models** — Pydantic schemas for request/response validation.

### Key Design Decisions
- **No ORM** — Raw SQL via asyncpg for performance and transparency
- **Dependency injection** — Services and repos wired up via FastAPI's DI system
- **Middleware-first auth** — Token validation happens before any route handler runs`;

const MERMAID_CONTENT = `graph TD
    A[HTTP Request] --> B[middleware.py]
    B --> C{Auth Valid?}
    C -->|No| D[401 Unauthorized]
    C -->|Yes| E[Route Handler]
    E --> F[Service Layer]
    F --> G[Repository]
    G --> H[(Database)]`;

const ONBOARDING_CONTENT = `## Developer Onboarding Guide

Welcome to helix-backend! This guide will get you productive in under 30 minutes.

### Prerequisites
- Python 3.11+
- PostgreSQL 14+
- Git

### Step 1: Clone and install
\`\`\`bash
git clone https://github.com/org/helix-backend
cd helix-backend
pip install -r requirements.txt
\`\`\`

### Step 2: Configure environment
Copy \`.env.example\` to \`.env\` and fill in your database URL and JWT secret.

### Step 3: Run migrations
\`\`\`bash
python -m alembic upgrade head
\`\`\`

### Step 4: Start the server
\`\`\`bash
uvicorn src.app:app --reload --port 8000
\`\`\`

### Key files to know
| File | Purpose |
|------|---------|
| \`src/auth.py\` | Start here to understand auth flow |
| \`src/services.py\` | Business logic entry points |
| \`src/db/repo.py\` | How we talk to the database |`;

type TreeNode = { id: string; name: string; type: 'file' | 'folder'; children?: TreeNode[] };

function FileNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  const isFolder = node.type === 'folder';
  return (
    <div>
      <button onClick={() => isFolder && setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-left hover:bg-[#1a1a25] rounded text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        style={{ paddingLeft: `${8 + depth * 14}px` }}>
        {isFolder
          ? open ? <FolderOpen size={12} className="text-indigo-400 flex-shrink-0" /> : <Folder size={12} className="text-indigo-400 flex-shrink-0" />
          : <FileCode2 size={12} className="text-zinc-500 flex-shrink-0" />}
        <span className="truncate">{node.name}</span>
        {isFolder && (open ? <ChevronDown size={10} className="ml-auto text-zinc-700" /> : <ChevronRight size={10} className="ml-auto text-zinc-700" />)}
      </button>
      {isFolder && open && node.children?.map(child => <FileNode key={child.id} node={child} depth={depth + 1} />)}
    </div>
  );
}

function SkeletonLine({ w = 'full' }: { w?: string }) {
  return <div className={`h-3 bg-[#1e1e2e] rounded animate-pulse w-${w} mb-2`} />;
}

const METHOD_COLOR: Record<string, string> = {
  GET: 'text-green-400 bg-green-500/10 border-green-500/20',
  POST: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  PUT: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  DELETE: 'text-red-400 bg-red-500/10 border-red-500/20',
};

export default function DocsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(true);
  const [copied, setCopied] = useState(false);
  const [repoLoaded] = useState(true);

  const generate = () => {
    setGenerating(true);
    setGenerated(false);
    setTimeout(() => { setGenerating(false); setGenerated(true); }, 2200);
  };

  const copy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const content = [README_CONTENT, '', ARCH_CONTENT, '', ONBOARDING_CONTENT].join('\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'helix-docs.md';
    a.click();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar breadcrumbs={[{ label: 'Documentation' }]} />
        {!repoLoaded ? (
          <EmptyState description="Upload a repository to generate README, API docs, architecture diagrams, and an onboarding guide automatically." />
        ) : (
          <div className="flex flex-1 min-h-0">
            {/* File tree */}
            <div className="w-52 flex-shrink-0 border-r border-[#1e1e2e] bg-[#0d0d14] flex flex-col">
              <div className="px-3 py-2 border-b border-[#1e1e2e]">
                <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Repository</div>
              </div>
              <div className="flex-1 overflow-y-auto p-1">
                {FILE_TREE.map(node => <FileNode key={node.id} node={node} />)}
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Tabs + actions */}
              <div className="flex items-center border-b border-[#1e1e2e] px-4 bg-[#0d0d14] flex-shrink-0">
                <div className="flex items-center gap-0.5 flex-1">
                  {TABS.map((tab, i) => (
                    <button key={tab} onClick={() => setActiveTab(i)}
                      className={cn('px-4 py-3 text-xs font-medium border-b-2 transition-colors',
                        activeTab === i ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
                      {tab}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 py-2">
                  <button onClick={copy}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-[#12121a] border border-[#1e1e2e] rounded-lg transition-colors">
                    {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                  <button onClick={download}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-[#12121a] border border-[#1e1e2e] rounded-lg transition-colors">
                    <Download size={12} /> Download .md
                  </button>
                  <button onClick={generate} disabled={generating}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors font-medium">
                    <Sparkles size={12} className={generating ? 'animate-spin' : ''} />
                    {generating ? 'Generating...' : 'Regenerate'}
                  </button>
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="max-w-3xl mx-auto">
                  {generating ? (
                    <div className="space-y-3 animate-pulse">
                      {Array.from({ length: 12 }).map((_, i) => (
                        <SkeletonLine key={i} w={['full', '3/4', 'full', '1/2', 'full', '5/6'][i % 6]} />
                      ))}
                    </div>
                  ) : !generated ? null : (
                    <AnimatePresence mode="wait">
                      <motion.div key={activeTab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                        {activeTab === 0 && (
                          <div className="prose prose-invert prose-sm max-w-none
                            prose-headings:text-white prose-headings:font-bold
                            prose-p:text-zinc-400 prose-code:text-indigo-300 prose-code:bg-indigo-500/10
                            prose-code:px-1.5 prose-code:rounded prose-pre:bg-[#12121a]
                            prose-pre:border prose-pre:border-[#1e1e2e] prose-strong:text-zinc-200
                            prose-li:text-zinc-400">
                            <pre className="whitespace-pre-wrap text-zinc-300 text-sm leading-relaxed font-sans">
                              {README_CONTENT}
                            </pre>
                          </div>
                        )}
                        {activeTab === 1 && (
                          <div className="space-y-4">
                            <div className="text-sm font-bold text-white mb-4">API Reference</div>
                            {API_CONTENT.map((ep, i) => (
                              <div key={i} className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl overflow-hidden">
                                <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e2e]">
                                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded border', METHOD_COLOR[ep.method])}>{ep.method}</span>
                                  <code className="text-sm text-white font-mono">{ep.path}</code>
                                  <span className="text-xs text-zinc-500 ml-auto">{ep.desc}</span>
                                </div>
                                <div className="px-4 py-3 grid grid-cols-2 gap-4">
                                  <div>
                                    <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Parameters</div>
                                    {ep.params.map(p => (
                                      <div key={p.name} className="flex items-center gap-2 text-xs mb-1">
                                        <code className="text-indigo-300">{p.name}</code>
                                        <span className="text-zinc-600">{p.type}</span>
                                        {p.req && <span className="text-red-400 text-[10px]">required</span>}
                                      </div>
                                    ))}
                                  </div>
                                  <div>
                                    <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Response</div>
                                    <code className="text-xs text-green-400">{ep.response}</code>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {activeTab === 2 && (
                          <div className="space-y-6">
                            <pre className="whitespace-pre-wrap text-zinc-400 text-sm leading-relaxed">{ARCH_CONTENT}</pre>
                            <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4">
                              <div className="text-xs font-medium text-zinc-500 mb-3 uppercase tracking-wider">Mermaid Diagram</div>
                              <pre className="text-xs text-indigo-300 font-mono leading-relaxed">{MERMAID_CONTENT}</pre>
                            </div>
                          </div>
                        )}
                        {activeTab === 3 && (
                          <pre className="whitespace-pre-wrap text-zinc-400 text-sm leading-relaxed">{ONBOARDING_CONTENT}</pre>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
