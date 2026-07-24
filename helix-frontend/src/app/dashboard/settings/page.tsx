'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Trash2, AlertTriangle, CheckCircle2, Shield, Zap, Eye } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { cn } from '@/lib/utils';

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={cn('relative w-10 h-5 rounded-full transition-colors flex-shrink-0', value ? 'bg-indigo-600' : 'bg-[#2e2e3e]')}>
      <motion.div
        animate={{ x: value ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow"
      />
    </button>
  );
}

function ConfirmModal({ open, onConfirm, onCancel, title, desc }: { open: boolean; onConfirm: () => void; onCancel: () => void; title: string; desc: string }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={onCancel} />
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-96 bg-[#0d0d14] border border-red-500/30 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle size={16} className="text-red-400" />
              </div>
              <div className="text-sm font-semibold text-white">{title}</div>
            </div>
            <p className="text-sm text-zinc-500 mb-5 leading-relaxed">{desc}</p>
            <div className="flex gap-3">
              <button onClick={onCancel}
                className="flex-1 px-4 py-2 text-sm text-zinc-400 bg-[#12121a] hover:bg-[#1a1a25] border border-[#1e1e2e] rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={onConfirm}
                className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors">
                Confirm
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

const LANG_COLORS: Record<string, string> = {
  Python: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  FastAPI: 'text-green-400 bg-green-500/10 border-green-500/20',
  PostgreSQL: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  JWT: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
};

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    securityScan: true,
    performanceAnalysis: true,
    autoReindex: false,
    deadCodeWarnings: true,
  });
  const [reindexing, setReindexing] = useState(false);
  const [reindexDone, setReindexDone] = useState(false);
  const [modal, setModal] = useState<'delete' | 'clear' | null>(null);
  const [doneActions, setDoneActions] = useState<string[]>([]);

  const setSetting = (key: keyof typeof settings) => (v: boolean) =>
    setSettings(prev => ({ ...prev, [key]: v }));

  const reindex = () => {
    setReindexing(true);
    setReindexDone(false);
    setTimeout(() => { setReindexing(false); setReindexDone(true); }, 2000);
  };

  const confirm = (action: 'delete' | 'clear') => {
    setModal(null);
    setDoneActions(prev => [...prev, action]);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-2xl mx-auto space-y-6">

            {/* Section 1: Repo Info */}
            <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6">
              <div className="text-sm font-semibold text-white mb-5">Repository Info</div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Repository name</label>
                  <input defaultValue="helix-backend"
                    className="w-full px-3 py-2 bg-[#12121a] border border-[#1e1e2e] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40 transition-colors" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-1.5 block">Description</label>
                  <textarea defaultValue="FastAPI backend with JWT auth and modular service architecture." rows={2}
                    className="w-full px-3 py-2 bg-[#12121a] border border-[#1e1e2e] rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-indigo-500/40 transition-colors resize-none" />
                </div>
                <div>
                  <label className="text-xs text-zinc-500 mb-2 block">Language badges</label>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(LANG_COLORS).map(([lang, cls]) => (
                      <span key={lang} className={cn('text-xs px-2.5 py-1 rounded-lg border font-medium', cls)}>{lang}</span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-1">
                  <div>
                    <div className="text-xs text-zinc-500">Last indexed</div>
                    <div className="text-xs text-zinc-300 mt-0.5">Today at 14:32 — 2 hours ago</div>
                  </div>
                  <button onClick={reindex} disabled={reindexing}
                    className="flex items-center gap-2 px-4 py-2 bg-[#12121a] hover:bg-[#1a1a25] border border-[#1e1e2e] text-sm text-zinc-300 rounded-lg transition-colors">
                    {reindexing
                      ? <RefreshCw size={13} className="animate-spin text-indigo-400" />
                      : reindexDone
                      ? <CheckCircle2 size={13} className="text-green-400" />
                      : <RefreshCw size={13} />}
                    {reindexing ? 'Re-indexing...' : reindexDone ? 'Done!' : 'Re-index now'}
                  </button>
                </div>
              </div>
            </div>

            {/* Section 2: Analysis Settings */}
            <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6">
              <div className="text-sm font-semibold text-white mb-5">Analysis Settings</div>
              <div className="space-y-4">
                {[
                  { key: 'securityScan' as const, icon: Shield, label: 'Enable security scan', desc: 'Detect auth vulnerabilities, exposed secrets, and SQL injection risks' },
                  { key: 'performanceAnalysis' as const, icon: Zap, label: 'Enable performance analysis', desc: 'Identify N+1 queries, blocking calls, and memory-heavy patterns' },
                  { key: 'autoReindex' as const, icon: RefreshCw, label: 'Auto re-index on upload', desc: 'Automatically parse and index new files after ZIP upload completes' },
                  { key: 'deadCodeWarnings' as const, icon: Eye, label: 'Show dead code warnings', desc: 'Flag functions, classes, and imports with no callers or references' },
                ].map(({ key, icon: Icon, label, desc }) => (
                  <div key={key} className="flex items-start justify-between gap-4 py-3 border-b border-[#1e1e2e] last:border-0">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-[#12121a] border border-[#1e1e2e] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon size={13} className="text-zinc-500" />
                      </div>
                      <div>
                        <div className="text-sm text-zinc-300">{label}</div>
                        <div className="text-xs text-zinc-600 mt-0.5 leading-relaxed">{desc}</div>
                      </div>
                    </div>
                    <Toggle value={settings[key]} onChange={setSetting(key)} />
                  </div>
                ))}
              </div>
            </div>

            {/* Section 3: Danger Zone */}
            <div className="bg-[#0d0d14] border border-red-500/20 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-5">
                <AlertTriangle size={14} className="text-red-400" />
                <div className="text-sm font-semibold text-red-400">Danger Zone</div>
              </div>
              <div className="space-y-3">
                {[
                  { action: 'delete' as const, label: 'Delete repository data', desc: 'Permanently removes all files, analysis results, and chat history for this repo.', done: doneActions.includes('delete') },
                  { action: 'clear' as const, label: 'Clear knowledge graph', desc: 'Wipes the dependency graph and AI index. The graph will need to be re-built.', done: doneActions.includes('clear') },
                ].map(({ action, label, desc, done }) => (
                  <div key={action} className="flex items-center justify-between gap-4 bg-red-500/5 border border-red-500/15 rounded-xl px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-red-300">{label}</div>
                      <div className="text-xs text-zinc-600 mt-0.5">{desc}</div>
                    </div>
                    {done
                      ? <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle2 size={12} /> Done</span>
                      : <button onClick={() => setModal(action)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-xs rounded-lg transition-colors flex-shrink-0">
                          <Trash2 size={12} /> {action === 'delete' ? 'Delete' : 'Clear'}
                        </button>
                    }
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={modal === 'delete'}
        onConfirm={() => confirm('delete')}
        onCancel={() => setModal(null)}
        title="Delete repository data"
        desc="This will permanently delete all files, analysis results, chat history, and the dependency graph for helix-backend. This cannot be undone."
      />
      <ConfirmModal
        open={modal === 'clear'}
        onConfirm={() => confirm('clear')}
        onCancel={() => setModal(null)}
        title="Clear knowledge graph"
        desc="This will wipe the entire dependency graph and AI knowledge index for helix-backend. You will need to re-index the repository to restore it."
      />
    </div>
  );
}
