'use client';
import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { Search, Bell, Terminal, ChevronRight, LogOut, User, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommandPalette } from '@/components/command/CommandPalette';
import { NotificationDrawer } from '@/components/notifications/NotificationDrawer';
import { useNotifications } from '@/components/notifications/useNotifications';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

// Map sub-paths to human labels
const SUB_LABELS: Record<string, string> = {
  graph: 'Graph Explorer',
  chat: 'AI Chat',
  analysis: 'Code Analysis',
  performance: 'Performance',
  impact: 'Impact Analysis',
  search: 'Search',
  docs: 'Documentation',
  timeline: 'Timeline',
  settings: 'Settings',
};

export function TopBar() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const path = usePathname();
  const { notifications, drawerOpen, setDrawerOpen, unreadCount, dismiss, clearAll, openDrawer } = useNotifications();

  // Build breadcrumbs from path
  const breadcrumbs: { label: string }[] = [];
  const repoMatch = path.match(/^\/repo\/([^/]+)(\/(.+))?$/);
  if (repoMatch) {
    try {
      const repoName = localStorage.getItem('helix_selected_repo_name') || repoMatch[1];
      breadcrumbs.push({ label: repoName });
      const sub = repoMatch[3];
      if (sub && SUB_LABELS[sub]) breadcrumbs.push({ label: SUB_LABELS[sub] });
    } catch { /* ignore */ }
  } else if (path === '/dashboard') {
    breadcrumbs.push({ label: 'Dashboard' });
  } else if (path.startsWith('/dashboard/')) {
    const sub = path.replace('/dashboard/', '');
    breadcrumbs.push({ label: 'Dashboard' });
    if (SUB_LABELS[sub]) breadcrumbs.push({ label: SUB_LABELS[sub] });
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const logout = () => {
    try {
      localStorage.removeItem('helix_api_key');
      localStorage.removeItem('helix_selected_repo_id');
      localStorage.removeItem('helix_selected_repo_name');
    } catch { /* ignore */ }
    router.replace('/auth/login');
  };

  return (
    <>
      <header className="h-12 flex items-center px-4 border-b border-[#1e1e2e] bg-[#0a0a0f]/80 backdrop-blur-sm flex-shrink-0">
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-zinc-600">Helix</span>
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight size={12} className="text-zinc-700" />
              <span className={i === breadcrumbs.length - 1 ? 'text-zinc-300' : 'text-zinc-500'}>
                {b.label}
              </span>
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Search */}
          <div className="relative cursor-pointer" onClick={() => setCmdOpen(true)}>
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <div className="w-48 h-8 pl-8 pr-3 rounded-md bg-[#12121a] border border-[#1e1e2e] text-sm text-zinc-600 flex items-center hover:border-indigo-500/30 transition-colors">
              Search...
            </div>
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-zinc-600 bg-[#1e1e2e] rounded px-1 py-0.5">⌘K</kbd>
          </div>

          <Button variant="ghost" size="icon" className="w-8 h-8">
            <Terminal size={14} />
          </Button>

          <Button variant="ghost" size="icon" className={cn('w-8 h-8 relative')} onClick={openDrawer}>
            <Bell size={14} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </Button>

          {/* Avatar */}
          <div ref={avatarRef} className="relative">
            <button
              onClick={() => setAvatarOpen(!avatarOpen)}
              className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white cursor-pointer hover:ring-2 hover:ring-indigo-500/40 transition-all"
            >
              H
            </button>
            <AnimatePresence>
              {avatarOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -4 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-2 w-48 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl shadow-2xl py-1 z-50"
                >
                  <div className="px-3 py-2.5 border-b border-[#1e1e2e]">
                    <div className="text-xs font-medium text-white">Harshita Yadav</div>
                    <div className="text-[10px] text-zinc-600">Helix user</div>
                  </div>
                  <button onClick={() => { setAvatarOpen(false); router.push('/dashboard/settings'); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a25] transition-colors">
                    <Settings size={13} /> Settings
                  </button>
                  <button onClick={() => { setAvatarOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-[#1a1a25] transition-colors">
                    <User size={13} /> Profile
                  </button>
                  <div className="border-t border-[#1e1e2e] mt-1 pt-1">
                    <button onClick={logout}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors rounded-b-xl">
                      <LogOut size={13} /> Sign out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <NotificationDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        notifications={notifications}
        onDismiss={dismiss}
        onClearAll={clearAll}
      />
    </>
  );
}
