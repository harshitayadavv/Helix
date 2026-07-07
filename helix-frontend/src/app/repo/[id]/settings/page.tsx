'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Trash2, AlertTriangle, CheckCircle2, Shield, Zap, Eye } from 'lucide-react';
import { getRepo, deleteRepo } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface RepoInfo { name: string; status: string; file_count: number; created_at: string; updated_at: string; }

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!value)}
      className={cn('relative w-10 h-5 rounded-full transition-colors flex-shrink-0', value ? 'bg-indigo-600' : 'bg-[#2e2e3e]')}>
      <motion.div animate={{ x: value ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 35 }}
        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow" />
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
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-96 bg-[#0d0d14] border border-red-500/30 rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <AlertTriangle size={16} className="text-red-400" />
              </div>
              <div className="text-sm font-semibold text-white">{title}</div>
            </div>
            <p className="text-sm text-zinc-500 mb-5 leading-relaxed">{desc}</p>
            <div className="flex gap-3">
              <button onClick={onCancel} className="flex-1 px-4 py-2 text-sm text-zinc-400 bg-[#12121a] hover:bg-[#1a1a25] border border-[#1e1e2e] rounded-lg transition-colors">Cancel</button>
              <button onClick={onConfirm} className="flex-1 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors">Confirm</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default function SettingsPage({ params }: { params: { id: string } }) {
  const [repoInfo, setRepoInfo] = useState<RepoInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState(false);
  const [reindexDone, setReindexDone] = useState(false);
  const [modal, setModal] = useState<'delete' | null>(null);
  const [settings, setSettings] = useState({ securityScan: true, performanceAnalysis: true, autoReindex: false, deadCodeWarnings: true });
  const router = useRouter();

  useEffect(() => {
    getRepo(params.id)
      .then(r => setRepoInfo(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [params.id]);

  const setSetting = (key: keyof typeof settings) => (v: boolean) =>
    setSettings(prev => ({ ...prev, [key]: v }));

  const reindex = () => {
    setReindexing(true);
    setReindexDone(false);
    setTimeout(() => { setReindexing(false); setReindexDone(true); }, 2000);
  };

  const confirmDelete = async () => {
    setModal(null);
    try {
      await deleteRepo(params.id);
      localStorage.removeItem('helix_selected_repo_id');
      localStorage.removeItem('helix_selected_repo_name');
      router.replace('/dashboard');
    } catch { /* ignore */ }
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Repo Info */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6">
          <div className="text-sm font-semibold text-white mb-5">Repository Info</div>
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-8 bg-[#12121a] rounded animate-pulse" />)}</div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Repository name</label>
                <input defaultValue={repoInfo?.name || ''}
                  className="w-full px-3 py-2 bg-[#12121a] border border-[#1e1e2e] rounded-lg text-sm text-white focus:outline-none focus:border-indigo-500/40 transition-colors" />
              </div>
              <div className="grid grid-cols-2 gap-4 text-xs text-zinc-500">
                <div>
                  <div className="text-zinc-600 mb-0.5">Status</div>
                  <div className="text-zinc-300 capitalize">{repoInfo?.status || '—'}</div>
                </div>
                <div>
                  <div className="text-zinc-600 mb-0.5">Files</div>
                  <div className="text-zinc-300">{repoInfo?.file_count || 0}</div>
                </div>
                <div>
                  <div className="text-zinc-600 mb-0.5">Created</div>
                  <div className="text-zinc-300">{repoInfo?.created_at ? new Date(repoInfo.created_at).toLocaleDateString() : '—'}</div>
                </div>
                <div>
                  <div className="text-zinc-600 mb-0.5">Last indexed</div>
                  <div className="text-zinc-300">{repoInfo?.updated_at ? new Date(repoInfo.updated_at).toLocaleDateString() : '—'}</div>
                </div>
              </div>
              <div className="flex items-center justify-end pt-1">
                <button onClick={reindex} disabled={reindexing}
                  className="flex items-center gap-2 px-4 py-2 bg-[#12121a] hover:bg-[#1a1a25] border border-[#1e1e2e] text-sm text-zinc-300 rounded-lg transition-colors">
                  {reindexing ? <RefreshCw size={13} className="animate-spin text-indigo-400" />
                    : reindexDone ? <CheckCircle2 size={13} className="text-green-400" />
                    : <RefreshCw size={13} />}
                  {reindexing ? 'Re-indexing...' : reindexDone ? 'Done!' : 'Re-index now'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Analysis Settings */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6">
          <div className="text-sm font-semibold text-white mb-5">Analysis Settings</div>
          <div className="space-y-4">
            {[
              { key: 'securityScan' as const, icon: Shield, label: 'Enable security scan', desc: 'Detect auth vulnerabilities, exposed secrets, and SQL injection risks' },
              { key: 'performanceAnalysis' as const, icon: Zap, label: 'Enable performance analysis', desc: 'Identify N+1 queries, blocking calls, and memory-heavy patterns' },
              { key: 'autoReindex' as const, icon: RefreshCw, label: 'Auto re-index on upload', desc: 'Automatically parse and index new files after upload completes' },
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

        {/* Danger Zone */}
        <div className="bg-[#0d0d14] border border-red-500/20 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle size={14} className="text-red-400" />
            <div className="text-sm font-semibold text-red-400">Danger Zone</div>
          </div>
          <div className="flex items-center justify-between gap-4 bg-red-500/5 border border-red-500/15 rounded-xl px-4 py-3">
            <div>
              <div className="text-sm font-medium text-red-300">Delete repository</div>
              <div className="text-xs text-zinc-600 mt-0.5">Permanently removes all data, graph, and analysis results.</div>
            </div>
            <button onClick={() => setModal('delete')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 text-xs rounded-lg transition-colors flex-shrink-0">
              <Trash2 size={12} /> Delete
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={modal === 'delete'}
        onConfirm={confirmDelete}
        onCancel={() => setModal(null)}
        title="Delete repository"
        desc="This will permanently delete all files, analysis results, chat history, and the dependency graph. This cannot be undone."
      />
    </div>
  );
}
