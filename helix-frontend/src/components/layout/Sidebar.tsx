'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, GitBranch, MessageSquare, Settings, Zap,
  ChevronRight, Network, Search, BarChart2, FileText,
  Clock, AlertTriangle, ChevronLeft, BarChart,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const REPO_NAV = [
  { group: 'Core', items: [
    { icon: BarChart, label: 'Overview', sub: '', shortcut: '⌘O' },
    { icon: Network, label: 'Graph Explorer', sub: '/graph', shortcut: '⌘G' },
    { icon: MessageSquare, label: 'AI Chat', sub: '/chat', shortcut: '⌘A' },
    { icon: Search, label: 'Search', sub: '/search', shortcut: '⌘F' },
  ]},
  { group: 'Analysis', items: [
    { icon: BarChart2, label: 'Code Analysis', sub: '/analysis', shortcut: '⌘N' },
    { icon: AlertTriangle, label: 'Performance', sub: '/performance', shortcut: '⌘E' },
    { icon: Zap, label: 'Impact Analysis', sub: '/impact', shortcut: '⌘I' },
    { icon: FileText, label: 'Documentation', sub: '/docs', shortcut: '⌘D' },
    { icon: Clock, label: 'Timeline', sub: '/timeline', shortcut: '⌘T' },
  ]},
  { group: 'Config', items: [
    { icon: Settings, label: 'Settings', sub: '/settings', shortcut: '⌘,' },
  ]},
];

function getRepoFromStorage(): { id: string; name: string } | null {
  try {
    const id = localStorage.getItem('helix_selected_repo_id');
    const name = localStorage.getItem('helix_selected_repo_name');
    if (id && name) return { id, name };
    return null;
  } catch { return null; }
}

export function Sidebar() {
  const path = usePathname();
  const router = useRouter();

  // Read repo from localStorage — use state so it reacts on navigation
  const [repo, setRepo] = React.useState<{ id: string; name: string } | null>(null);

  React.useEffect(() => {
    setRepo(getRepoFromStorage());
  }, [path]); // re-read on every route change

  const clearRepo = () => {
    try {
      localStorage.removeItem('helix_selected_repo_id');
      localStorage.removeItem('helix_selected_repo_name');
    } catch { /* ignore */ }
    setRepo(null);
    router.push('/dashboard');
  };

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-[#0d0d14] border-r border-[#1e1e2e] h-screen">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-semibold text-white tracking-tight">Helix</span>
          <span className="ml-auto text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5">BETA</span>
        </div>
      </div>

      {/* NO REPO SELECTED — minimal nav */}
      {!repo && (
        <nav className="flex-1 px-2 py-3">
          <Link href="/dashboard">
            <motion.div whileHover={{ x: 2 }}
              className={cn(
                'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors',
                path === '/dashboard'
                  ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/20'
                  : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a25]'
              )}>
              <LayoutDashboard size={14} />
              <span className="text-xs">Dashboard</span>
              {path === '/dashboard' && <ChevronRight size={11} className="ml-auto opacity-60" />}
            </motion.div>
          </Link>
          <div className="mt-6 px-2">
            <div className="text-[11px] text-zinc-700 leading-relaxed">
              Select a repository from the dashboard to explore its graph, analysis, and AI features.
            </div>
          </div>
        </nav>
      )}

      {/* REPO SELECTED — full nav */}
      {repo && (
        <>
          {/* Back + repo name */}
          <div className="px-3 py-3 border-b border-[#1e1e2e]">
            <button onClick={clearRepo}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors mb-2.5 group">
              <ChevronLeft size={12} className="group-hover:-translate-x-0.5 transition-transform" />
              Back to Dashboard
            </button>
            <div className="flex items-center gap-2 bg-[#12121a] border border-[#1e1e2e] rounded-lg px-2.5 py-2">
              <GitBranch size={12} className="text-indigo-400 flex-shrink-0" />
              <span className="text-xs font-medium text-zinc-300 truncate">{repo.name}</span>
            </div>
          </div>

          {/* Nav groups */}
          <nav className="flex-1 overflow-y-auto px-2 py-2 space-y-3">
            {REPO_NAV.map(({ group, items }) => (
              <div key={group}>
                <div className="text-[9px] font-semibold text-zinc-700 uppercase tracking-widest px-2 mb-1">{group}</div>
                <div className="space-y-0.5">
                  {items.map(({ icon: Icon, label, sub, shortcut }) => {
                    const href = `/repo/${repo.id}${sub}`;
                    const active = path === href;
                    return (
                      <Link key={href} href={href}>
                        <motion.div whileHover={{ x: 2 }}
                          className={cn(
                            'flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-colors group',
                            active
                              ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/20'
                              : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a25]'
                          )}>
                          <Icon size={13} className="flex-shrink-0" />
                          <span className="text-xs flex-1">{label}</span>
                          <span className={cn(
                            'text-[9px] opacity-0 group-hover:opacity-100 transition-opacity',
                            active ? 'opacity-100 text-indigo-400' : 'text-zinc-700'
                          )}>{shortcut}</span>
                          {active && <ChevronRight size={10} className="flex-shrink-0 opacity-60" />}
                        </motion.div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </>
      )}

      {/* Bottom: dashboard link when in repo */}
      {repo && (
        <div className="px-3 py-3 border-t border-[#1e1e2e]">
          <Link href="/dashboard">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-zinc-600 hover:text-zinc-400 hover:bg-[#1a1a25] transition-colors">
              <LayoutDashboard size={11} />
              <span>All repositories</span>
            </div>
          </Link>
        </div>
      )}
    </aside>
  );
}

// Need React import for useState/useEffect
import React from 'react';
