'use client';
import { useState } from 'react';
import { Search, Bell, Terminal, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommandPalette } from '@/components/command/CommandPalette';
import { NotificationDrawer } from '@/components/notifications/NotificationDrawer';
import { useNotifications } from '@/components/notifications/useNotifications';
import { cn } from '@/lib/utils';

interface TopBarProps {
  breadcrumbs?: { label: string; href?: string }[];
}

export function TopBar({ breadcrumbs = [] }: TopBarProps) {
  const [cmdOpen, setCmdOpen] = useState(false);
  const { notifications, drawerOpen, setDrawerOpen, unreadCount, dismiss, clearAll, openDrawer } = useNotifications();

  return (
    <>
      <header className="h-12 flex items-center px-4 border-b border-[#1e1e2e] bg-[#0a0a0f]/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-zinc-600">Helix</span>
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight size={12} className="text-zinc-700" />
              <span className={i === breadcrumbs.length - 1 ? 'text-zinc-300' : 'text-zinc-500'}>{b.label}</span>
            </span>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
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

          <Button
            variant="ghost" size="icon"
            className={cn('w-8 h-8 relative')}
            onClick={openDrawer}
          >
            <Bell size={14} />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-indigo-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </Button>

          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xs font-bold text-white cursor-pointer">H</div>
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
