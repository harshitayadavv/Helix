'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileCode2, Code2, Box, Clock, X, ArrowRight, Sparkles } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { EmptyState } from '@/components/common/EmptyState';
import { searchCode, getSearchHistory } from '@/lib/api';
import { useRepo } from '@/context/RepoContext';
import { cn } from '@/lib/utils';

type FilterType = 'all' | 'function' | 'class' | 'file' | 'api';

interface SearchResult {
  id: string;
  type: 'function' | 'class' | 'file' | 'api';
  name: string;
  path: string;
  line_number?: number;
  description: string;
}

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

const MOCK_RESULTS: SearchResult[] = [
  { id: '1', type: 'file', name: 'auth.py', path: 'src/auth.py', line_number: 1, description: 'Handles JWT authentication, token parsing, and user validation logic' },
  { id: '2', type: 'class', name: 'UserService', path: 'src/services.py', line_number: 12, description: 'Service layer for user CRUD operations and profile management' },
  { id: '3', type: 'class', name: 'AuthHandler', path: 'src/auth.py', line_number: 45, description: 'Manages login, logout, and session handling' },
  { id: '4', type: 'function', name: 'parse_token', path: 'src/utils.py', line_number: 8, description: 'Decodes and validates JWT tokens, returns payload or raises error' },
  { id: '5', type: 'function', name: 'validate_user', path: 'src/auth.py', line_number: 78, description: 'Checks decoded token payload against active user records' },
  { id: '6', type: 'api', name: 'POST /auth/login', path: 'src/routes/auth.py', line_number: 23, description: 'Authenticates user credentials and returns a JWT access token' },
  { id: '7', type: 'api', name: 'GET /users/:id', path: 'src/routes/users.py', line_number: 11, description: 'Fetches a single user profile by ID' },
];

export default function SearchPage() {
  const { selectedRepoId } = useRepo();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading, setLoading] = useState(false);
  const [repoLoaded] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Load search history from backend
  useEffect(() => {
    if (!repoLoaded) return;
    getSearchHistory((selectedRepoId || '1'))
      .then(r => setRecent(r.data?.history || []))
      .catch(() => {
        try {
          const stored = localStorage.getItem('helix_recent_searches');
          if (stored) setRecent(JSON.parse(stored));
        } catch { /* ignore */ }
      });
  }, [repoLoaded]);

  const doSearch = useCallback(async (q: string, f: FilterType) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const r = await searchCode(q, (selectedRepoId || '1'), f);
      setResults(r.data?.results || MOCK_RESULTS.filter(res =>
        (f === 'all' || res.type === f) &&
        (res.name.toLowerCase().includes(q.toLowerCase()) || res.description.toLowerCase().includes(q.toLowerCase()))
      ));
    } catch {
      setResults(MOCK_RESULTS.filter(res =>
        (f === 'all' || res.type === f) &&
        (res.name.toLowerCase().includes(q.toLowerCase()) || res.description.toLowerCase().includes(q.toLowerCase()))
      ));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query, filter), 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, filter, doSearch]);

  useEffect(() => { setSelected(0); }, [results]);

  const viewInGraph = (result: SearchResult) => {
    // Save to recent
    const updated = [result.name, ...recent.filter(r => r !== result.name)].slice(0, 6);
    setRecent(updated);
    try { localStorage.setItem('helix_recent_searches', JSON.stringify(updated)); } catch { /* ignore */ }
    router.push('/dashboard/graph');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[selected]) viewInGraph(results[selected]);
  };

  const clearRecent = () => {
    setRecent([]);
    try { localStorage.removeItem('helix_recent_searches'); } catch { /* ignore */ }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        {!repoLoaded ? (
          <EmptyState description="Upload a repository to search across functions, classes, files, and API endpoints." />
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-10">
            <div className="max-w-2xl mx-auto">
              {/* Search bar */}
              <div className="relative mb-2">
                <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Search functions, classes, files, APIs..."
                  className="w-full pl-14 pr-12 py-4 bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl text-base text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/10 transition-all"
                />
                {query && (
                  <button onClick={() => setQuery('')} className="absolute right-5 top-1/2 -translate-y-1/2">
                    <X size={16} className="text-zinc-600 hover:text-zinc-400" />
                  </button>
                )}
              </div>

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

              {/* Recent (when no query) */}
              {!query && recent.length > 0 && (
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-medium text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                      <Clock size={11} /> Recent
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

              {/* Loading */}
              {loading && (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="h-20 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl animate-pulse" />
                  ))}
                </div>
              )}

              {/* Results */}
              {!loading && (
                <div className="space-y-2">
                  <AnimatePresence>
                    {results.map((result, i) => {
                      const cfg = TYPE_CONFIG[result.type];
                      const Icon = cfg.icon;
                      return (
                        <motion.div key={result.id}
                          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                          onMouseEnter={() => setSelected(i)}
                          onClick={() => viewInGraph(result)}
                          className={cn('flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer',
                            selected === i ? 'bg-indigo-600/10 border-indigo-500/30' : 'bg-[#0d0d14] border-[#1e1e2e] hover:border-[#2e2e3e]')}>
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
                            <div className="text-xs text-zinc-600 font-mono mb-1">
                              {result.path}{result.line_number ? `:${result.line_number}` : ''}
                            </div>
                            <div className="text-xs text-zinc-500 leading-relaxed">{result.description}</div>
                          </div>
                          <button onClick={e => { e.stopPropagation(); viewInGraph(result); }}
                            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors flex-shrink-0 self-center">
                            View in Graph <ArrowRight size={11} />
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {query && !loading && results.length === 0 && (
                    <div className="text-center py-16 text-sm text-zinc-600">No results for &quot;{query}&quot;</div>
                  )}
                </div>
              )}

              {results.length > 0 && (
                <div className="flex items-center gap-4 mt-6 text-[10px] text-zinc-700 justify-center">
                  <span>↑↓ navigate</span><span>↵ open in graph</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
