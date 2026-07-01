'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileCode2, GitBranch, LayoutDashboard, Network, MessageSquare, BarChart2, ArrowRight, Clock } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface CommandItem {
  icon: typeof Search;
  label: string;
  href: string;
  type: string;
  sub?: string;
  color?: string;
}

const PAGES: CommandItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard', type: 'page' },
  { icon: Network, label: 'Graph Explorer', href: '/dashboard/graph', type: 'page' },
  { icon: MessageSquare, label: 'AI Chat', href: '/dashboard/chat', type: 'page' },
  { icon: BarChart2, label: 'Code Analysis', href: '/dashboard/analysis', type: 'page' },
  { icon: Search, label: 'Search', href: '/dashboard/search', type: 'page' },
];

const NODES: CommandItem[] = [
  { icon: FileCode2, label: 'auth.py', sub: 'src/auth.py · File', href: '/repo/demo', type: 'node', color: '#3b82f6' },
  { icon: FileCode2, label: 'UserService', sub: 'src/services.py · Class', href: '/repo/demo', type: 'node', color: '#a855f7' },
  { icon: FileCode2, label: 'parse_token', sub: 'src/utils.py · Function', href: '/repo/demo', type: 'node', color: '#22c55e' },
  { icon: GitBranch, label: 'helix-backend', sub: 'Repository', href: '/repo/1', type: 'repo', color: '#6366f1' },
  { icon: GitBranch, label: 'react-dashboard', sub: 'Repository', href: '/repo/2', type: 'repo', color: '#6366f1' },
];

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const allItems = [...PAGES, ...NODES];
  const filtered = query.trim()
    ? allItems.filter(i => i.label.toLowerCase().includes(query.toLowerCase()) || i.sub?.toLowerCase().includes(query.toLowerCase()))
    : allItems;

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
    setQuery('');
  }, [router, onClose]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelected(0);
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') { onClose(); setQuery(''); }
      if (e.key === 'ArrowDown') { e.preventDefault(); setSelected(s => Math.min(s + 1, filtered.length - 1)); }
      if (e.key === 'ArrowUp') { e.preventDefault(); setSelected(s => Math.max(s - 1, 0)); }
      if (e.key === 'Enter' && filtered[selected]) navigate(filtered[selected].href);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filtered, selected, navigate, onClose]);

  useEffect(() => { setSelected(0); }, [query]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={() => { onClose(); setQuery(''); }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
            className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[560px] z-50 bg-[#0d0d14] border border-[#2e2e3e] rounded-2xl shadow-2xl overflow-hidden"
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-[#1e1e2e]">
              <Search size={16} className="text-zinc-500 flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search pages, repos, nodes..."
                className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-600 focus:outline-none"
              />
              <kbd className="text-[10px] text-zinc-600 bg-[#1e1e2e] rounded px-1.5 py-0.5">ESC</kbd>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto py-2">
              {!query && (
                <div className="px-4 py-1 mb-1">
                  <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock size={10} /> Recent & Pages
                  </span>
                </div>
              )}
              {filtered.length === 0 && (
                <div className="text-center py-8 text-sm text-zinc-600">No results for &quot;{query}&quot;</div>
              )}
              {filtered.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={i}
                    onClick={() => navigate(item.href)}
                    onMouseEnter={() => setSelected(i)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors',
                      selected === i ? 'bg-indigo-600/15' : 'hover:bg-[#1a1a25]'
                    )}
                  >
                    <div className="w-7 h-7 rounded-lg bg-[#1e1e2e] flex items-center justify-center flex-shrink-0">
                      <Icon size={13} style={{ color: item.color || '#6366f1' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white">{item.label}</div>
                      {item.sub && <div className="text-xs text-zinc-500 truncate">{item.sub}</div>}
                    </div>
                    <div className={cn('text-[10px] px-1.5 py-0.5 rounded border',
                      item.type === 'page' ? 'text-indigo-400 border-indigo-500/20 bg-indigo-500/10' :
                      item.type === 'repo' ? 'text-zinc-400 border-zinc-700 bg-zinc-800/30' :
                      'text-zinc-500 border-zinc-800'
                    )}>
                      {item.type}
                    </div>
                    {selected === i && <ArrowRight size={13} className="text-zinc-500" />}
                  </button>
                );
              })}
            </div>

            <div className="px-4 py-2 border-t border-[#1e1e2e] flex items-center gap-4 text-[10px] text-zinc-600">
              <span>↑↓ navigate</span>
              <span>↵ open</span>
              <span>esc close</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
