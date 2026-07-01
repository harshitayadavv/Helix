'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, GitBranch, MessageSquare, Settings, Zap,
  ChevronRight, Plus, Network, Search, BarChart2, Zap as Impact,
  FileText, GitCompare,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const nav = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard', shortcut: '⌘D' },
  { icon: Network, label: 'Graph Explorer', href: '/dashboard/graph', shortcut: '⌘G' },
  { icon: MessageSquare, label: 'AI Chat', href: '/dashboard/chat', shortcut: '⌘A' },
  { icon: BarChart2, label: 'Code Analysis', href: '/dashboard/analysis', shortcut: '⌘N' },
  { icon: Impact, label: 'Impact Analysis', href: '/dashboard/impact', shortcut: '⌘I' },
  { icon: Search, label: 'Search', href: '/dashboard/search', shortcut: '⌘F' },
  { icon: FileText, label: 'Documentation', href: '/dashboard/docs', shortcut: '⌘O' },
  { icon: GitCompare, label: 'Compare', href: '/dashboard/compare', shortcut: '⌘P' },
  { icon: Settings, label: 'Settings', href: '/dashboard/settings', shortcut: '⌘,' },
];

const recentRepos = [
  { id: '1', name: 'helix-backend', status: 'ready' },
  { id: '2', name: 'react-dashboard', status: 'processing' },
  { id: '3', name: 'ml-pipeline', status: 'ready' },
];

export function Sidebar() {
  const path = usePathname();

  return (
    <aside className="w-56 flex-shrink-0 flex flex-col bg-[#0d0d14] border-r border-[#1e1e2e] h-screen">
      <div className="px-4 py-4 border-b border-[#1e1e2e]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-semibold text-white tracking-tight">Helix</span>
          <span className="ml-auto text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5">BETA</span>
        </div>
      </div>

      <nav className="flex-1 px-2 py-2 space-y-0.5 overflow-y-auto">
        {nav.map(({ icon: Icon, label, href, shortcut }) => {
          const active = path === href;
          return (
            <Link key={href} href={href}>
              <motion.div
                whileHover={{ x: 2 }}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-1.5 rounded-md text-sm transition-colors group',
                  active
                    ? 'bg-indigo-600/15 text-indigo-300 border border-indigo-500/20'
                    : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a25]'
                )}
              >
                <Icon size={14} className="flex-shrink-0" />
                <span className="flex-1 text-xs">{label}</span>
                <span className={cn(
                  'text-[9px] opacity-0 group-hover:opacity-100 transition-opacity',
                  active ? 'opacity-100 text-indigo-400' : 'text-zinc-700'
                )}>{shortcut}</span>
                {active && <ChevronRight size={11} className="flex-shrink-0 opacity-60" />}
              </motion.div>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-[#1e1e2e]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Recent</span>
          <Link href="/dashboard">
            <Plus size={12} className="text-zinc-600 hover:text-zinc-400 transition-colors" />
          </Link>
        </div>
        <div className="space-y-0.5">
          {recentRepos.map((repo) => (
            <Link key={repo.id} href={`/repo/${repo.id}`}>
              <div className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a25] transition-colors">
                <GitBranch size={10} className="flex-shrink-0" />
                <span className="truncate text-[11px]">{repo.name}</span>
                <span className={cn('ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0',
                  repo.status === 'ready' ? 'bg-green-500' : 'bg-yellow-500 animate-pulse')} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </aside>
  );
}
