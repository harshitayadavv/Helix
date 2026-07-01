'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, AlertTriangle, XCircle, Info, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Notification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
  timestamp: string;
  read: boolean;
}

const TYPE_CONFIG = {
  success: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  info: { icon: Info, color: 'text-indigo-400', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
};

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  notifications: Notification[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

export function NotificationDrawer({ open, onClose, notifications, onDismiss, onClearAll }: NotificationDrawerProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-80 z-50 bg-[#0d0d14] border-l border-[#1e1e2e] flex flex-col shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#1e1e2e]">
              <div className="flex items-center gap-2">
                <Bell size={15} className="text-zinc-400" />
                <span className="text-sm font-semibold text-white">Notifications</span>
                {notifications.filter(n => !n.read).length > 0 && (
                  <span className="text-[10px] bg-indigo-600 text-white rounded-full px-1.5 py-0.5 font-medium">
                    {notifications.filter(n => !n.read).length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {notifications.length > 0 && (
                  <button onClick={onClearAll} className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">
                    Clear all
                  </button>
                )}
                <button onClick={onClose}>
                  <X size={15} className="text-zinc-600 hover:text-zinc-400" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                  <div className="w-12 h-12 rounded-2xl bg-[#12121a] border border-[#1e1e2e] flex items-center justify-center">
                    <Bell size={20} className="text-zinc-700" />
                  </div>
                  <div className="text-sm text-zinc-600">No notifications</div>
                </div>
              ) : (
                <div className="divide-y divide-[#1e1e2e]">
                  <AnimatePresence>
                    {notifications.map(n => {
                      const cfg = TYPE_CONFIG[n.type];
                      const Icon = cfg.icon;
                      return (
                        <motion.div
                          key={n.id}
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 20, height: 0 }}
                          className={cn('px-4 py-3 hover:bg-[#12121a] transition-colors', !n.read && 'border-l-2 border-indigo-500')}
                        >
                          <div className="flex items-start gap-3">
                            <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg, `border ${cfg.border}`)}>
                              <Icon size={13} className={cfg.color} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white leading-tight">{n.title}</div>
                              {n.message && <div className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{n.message}</div>}
                              <div className="text-[10px] text-zinc-700 mt-1">{n.timestamp}</div>
                            </div>
                            <button onClick={() => onDismiss(n.id)} className="flex-shrink-0">
                              <X size={12} className="text-zinc-700 hover:text-zinc-500" />
                            </button>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
