'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileCode2, Code2, Box, Clock, X, ArrowRight, Sparkles } from 'lucide-react';
import { searchCode, getSearchHistory } from '@/lib/api';
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

// Redis may return objects like { query: "...", result_count: 1 } or plain strings
type RecentEntry = string | { query?: string; text?: string; [key: string]: unknown };

function extractQueryString(entry: RecentEntry): string {
  if (typeof entry === 'string') return entry;
  return entry?.query || entry?.text || JSON.stringify(entry);
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',      label: 'All'       },
  { key: 'function', label: 'Functions' },
  { key: 'class',    label: 'Classes'   },
  { key: 'file',     label: 'Files'     },
  { key: 'api',      label: 'APIs'      },
];

const TYPE_CONFIG = {
  function: { icon: Code2,      color: '#22c55e' },
  class:    { icon: Box,        color: '#a855f7' },
  file:     { icon: FileCode2,  color: '#3b82f6' },
  api:      { icon: Sparkles,   color: '#f97316' },
};

export default function SearchPage({ params }: { params: { id: string } }) {
  const [query,    setQuery]    = useState('');
  const [filter,   setFilter]   = useState<FilterType>('all');
  const [results,  setResults]  = useState<SearchResult[]>([]);
  const [recent,   setRecent]   = useState<RecentEntry[]>([]);
  const [selected, setSelected] = useState(0);
  const [loading,  setLoading]  = useState(false);
  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const router      = useRouter();

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Load search history — Redis may return objects or strings
  useEffect(() => {
    getSearchHistory(params.id)
      .then(r => {
        const raw = r.data?.history || r.data || [];
        setRecent(Array.isArray(raw) ? raw : []);
      })
      .catch(() => {
        try {
          const stored = localStorage.getItem('helix_recent_searches');
          if (stored) setRecent(JSON.parse(stored));
        } catch { /* ignore */ }
      });
  }, [params.id]);

  const doSearch = useCallback(async (q: string, f: FilterType) => {
  if (!q.trim()) { setResults([]); return; }
  setLoading(true);
  try {
    // Map frontend filter to backend expected values
    const typeMap: Record<FilterType, string> = {
      all: 'all',
      function: 'Function',
      class: 'Class', 
      file: 'File',
      api: 'Function'  // fallback
    };
    const r = await searchCode(q, params.id, typeMap[f]);
    // Backend returns { results: [...] } or flat array
    const raw = r.data?.results || r.data || [];
    setResults(Array.isArray(raw) ? raw : []);
  } catch {
    setResults([]);
  } finally {
    setLoading(false);
  }
}, [params.id]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(query, filter), 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, filter, doSearch]);

  useEffect(() => { setSelected(0); }, [results]);

  const viewInGraph = (result: SearchResult) => {
    const str = result.name;
    const updated = [str, ...recent.map(extractQueryString).filter(s => s !== str)].slice(0, 6);
    setRecent(updated);
    try { localStorage.setItem('helix_recent_searches', JSON.stringify(updated)); } catch { /* ignore */ }
    router.push(`/repo/${params.id}/graph`);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && results[selected]) viewInGraph(results[selected]);
  };

  const clearRecent = () => {
    setRecent([]);
    try { localStorage.removeItem('helix_recent_searches'); } catch { /* ignore */ }
  };

  return (
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

        {/* Recent searches */}
        {!query && recent.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-medium text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                <Clock size={11} /> Recent
              </span>
              <button onClick={clearRecent} className="text-[11px] text-zinc-600 hover:text-zinc-400">Clear</button>
            </div>
            <div className="flex flex-wrap gap-2">
              {recent.map((entry, i) => {
                const label = extractQueryString(entry);
                return (
                  <button key={i} onClick={() => setQuery(label)}
                    className="px-3 py-1.5 bg-[#0d0d14] border border-[#1e1e2e] rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:border-[#2e2e3e] transition-colors">
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Loading skeletons */}
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
                const cfg  = TYPE_CONFIG[result.type] || TYPE_CONFIG.file;
                const Icon = cfg.icon;
                return (
                  <motion.div key={result.id}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}
                    onMouseEnter={() => setSelected(i)}
                    onClick={() => viewInGraph(result)}
                    className={cn('flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer',
                      selected === i
                        ? 'bg-indigo-600/10 border-indigo-500/30'
                        : 'bg-[#0d0d14] border-[#1e1e2e] hover:border-[#2e2e3e]')}>
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
                    <button
                      onClick={e => { e.stopPropagation(); viewInGraph(result); }}
                      className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/10 transition-colors flex-shrink-0 self-center">
                      View in Graph <ArrowRight size={11} />
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {query && !loading && results.length === 0 && (
              <div className="text-center py-16 text-sm text-zinc-600">
                No results for &quot;{query}&quot;
              </div>
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
  );
}
