'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileCode2, Code2, Box, Clock, X, ArrowRight, Sparkles } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { cn } from '@/lib/utils';

type FilterType = 'all' | 'function' | 'class' | 'file' | 'api';

interface SearchResult {
  id: string;
  type: 'function' | 'class' | 'file' | 'api';
  name: string;
  path: string;
  desc: string;
}

const ALL_RESULTS: SearchResult[] = [
  { id: '1', type: 'file', name: 'auth.py', path: 'src/auth.py', desc: 'Handles JWT authentication, token parsing, and user validation logic' },
  { id: '2', type: 'class', name: 'UserService', path: 'src/services.py', desc: 'Service layer for user CRUD operations and profile management' },
  { id: '3', type: 'class', name: 'AuthHandler', path: 'src/auth.py', desc: 'Manages login, logout, and session handling' },
  { id: '4', type: 'function', name: 'parse_token', path: 'src/utils.py', desc: 'Decodes and validates JWT tokens, returns payload or raises error' },
  { id: '5', type: 'function', name: 'validate_user', path: 'src/auth.py', desc: 'Checks decoded token payload against active user records' },
  { id: '6', type: 'function', name: 'hash_password', path: 'src/utils.py', desc: 'Hashes plaintext passwords before storage using bcrypt' },
  { id: '7', type: 'api', name: 'POST /auth/login', path: 'src/routes/auth.py', desc: 'Authenticates user credentials and returns a JWT access token' },
  { id: '8', type: 'api', name: 'GET /users/:id', path: 'src/routes/users.py', desc: 'Fetches a single user profile by ID' },
  { id: '9', type: 'api', name: 'POST /payments/charge', path: 'src/routes/payments.py', desc: 'Processes a payment charge through the payment gateway' },
  { id: '10', type: 'class', name: 'Repository', path: 'src/db/repo.py', desc: 'Generic data access layer wrapping SQL queries' },
  { id: '11', type: 'file', name: 'middleware.py', path: 'src/middleware.py', desc: 'Request/response interceptor for auth, logging, and CORS' },
  { id: '12', type: 'function', name: 'compute_risk_score', path: 'src/payments/risk.py', desc: 'Calculates fraud risk score for a transaction' },
];

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'function', label: 'Functions' },
  { key: 'class', label: 'Classes' },
  { key: 'file', label: 'Files' },
  { key: 'api', label: 'APIs' },
];

const TYPE_CONFIG = {
  function: { icon: Code2, color: '#22c55e' },
  class: { icon: Box, color: '#a855f7' },
  file: { icon: FileCode2, color: '#3b82f6' },
  api: { icon: Sparkles, color: '#f97316' },
};

const RECENT_KEY = 'helix_recent_searches';

export default function SearchPage() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [selected, setSelected] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    inputRef.current?.focus();
    try {
      const stored = localStorage.getItem(RECENT_KEY);
      if (stored) setRecent(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const saveRecent = useCallback((q: string) => {
    if (!q.trim()) return;
    setRecent(prev => {
      const next = [q, ...prev.filter(r => r !== q)].slice(0, 6);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const results = ALL_RESULTS.filter(r => {
    const matchesType = filter === 'all' || r.type === filter;
    const matchesQuery = !query || r.name.toLowerCase().includes(query.toLowerCase()) || r.desc.toLowerCase().includes(query.toLowerCase());
    return matchesType && matchesQuery;
  });

  useEffect(() => { setSelected(0); }, [query, filter]);

  const viewInGraph = () => {
    saveRecent(query);
    router.push('/dashboard/graph');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[selected]) viewInGraph();
  };

  const clearRecent = () => {
    setRecent([]);
    try { localStorage.removeItem(RECENT_KEY); } catch { /* ignore */ }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar breadcrumbs={[{ label: 'Search' }]} />
        <div className="flex-1 overflow-y-auto px-6 py-10">
          <div className="max-w-2xl mx-auto">

            {/* Big search bar */}
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-2">
              <div className="relative">
                <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  onBlur={() => query && saveRecent(query)}
                  placeholder="Search functions, classes, files, APIs..."
                  className="w-full pl-14 pr-12 py-4 bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="absolute right-5 top-1/2 -translate-y-1/2">
                    <X size={16} className="text-zinc-600 hover:text-zinc-400" />
                  </button>
                )}
              </div>
            </motion.div>

            {/* Filter chips */}
            <div className="flex items-center gap-2 mb-6 mt-4">
              {FILTERS.map(({ key, label }) => (
                <button key={key} onClick={() => setFilter(key)}
                  className={cn('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                    filter === key
                      ? 'bg-indigo-600/15 text-indigo-300 border-indigo-500/30'
                      : 'text-zinc-500 border-[#1e1e2e] hover:text-zinc-300 hover:border-[#2e2e3e]')}>
                  {label}
                </button>
              ))}
            </div>

            {/* Recent searches (when empty query) */}
            {!query && recent.length > 0 && (
              <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-medium text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={11} /> Recent searches
                  </span>
                  <button onClick={clearRecent} className="text-[11px] text-zinc-600 hover:text-zinc-400">Clear</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {recent.map((r, i) => (
                    <button key={i} onClick={() => setQuery(r)}
                      className="px-3 py-1.5 bg-[#0d0d14] border border-[#1e1e2e] rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:border-[#2e2e3e] transition-colors">
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results */}
            <div className="space-y-2">
              <AnimatePresence>
                {results.map((result, i) => {
                  const cfg = TYPE_CONFIG[result.type];
                  const Icon = cfg.icon;
                  return (
                    <motion.div
                      key={result.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      onMouseEnter={() => setSelected(i)}
                      className={cn('flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer',
                        selected === i ? 'bg-indigo-600/10 border-indigo-500/30' : 'bg-[#0d0d14] border-[#1e1e2e] hover:border-[#2e2e3e]')}
                      onClick={() => viewInGraph()}
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${cfg.color}15`, border: `1px solid ${cfg.color}30` }}>
                        <Icon size={15} style={{ color: cfg.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-semibold text-white">{result.name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide"
                            style={{ background: `${cfg.color}15`, color: cfg.color }}>
                            {result.type}
                          </span>
                        </div>
                        <div className="text-xs text-zinc-600 font-mono mb-1">{result.path}</div>
                        <div className="text-xs text-zinc-500 leading-relaxed">{result.desc}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); viewInGraph(); }}
                        className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors flex-shrink-0 self-center">
                        View in Graph <ArrowRight size={11} />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {results.length === 0 && (
                <div className="text-center py-16">
                  <div className="text-sm text-zinc-600">No results for &quot;{query}&quot;</div>
                </div>
              )}
            </div>

            {results.length > 0 && (
              <div className="flex items-center gap-4 mt-6 text-[10px] text-zinc-700 justify-center">
                <span>↑↓ navigate</span>
                <span>↵ open in graph</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
