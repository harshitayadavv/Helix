'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { GitBranch, Plus, Zap, RefreshCw, CheckCircle2, Clock, AlertCircle, Upload } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { RepoUploader } from '@/components/upload/RepoUploader';
import { ProcessingProgress } from '@/components/dashboard/ProcessingProgress';
import { HelixLoader } from '@/components/loading/HelixLoader';
import { Button } from '@/components/ui/button';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useNavigateWithDelay } from '@/hooks/useNavigateWithDelay';
import { getRepos } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Repo {
  id: string;
  name: string;
  status: 'pending' | 'extracting' | 'completed' | 'failed';
  file_count: number;
  function_count: number;
  class_count: number;
  created_at: string;
  updated_at: string;
}

const STATUS_CONFIG = {
  completed:  { label: 'Ready',      icon: CheckCircle2, color: 'text-green-400',  spin: false },
  pending:    { label: 'Processing', icon: Clock,        color: 'text-yellow-400', spin: false },
  extracting: { label: 'Processing', icon: RefreshCw,    color: 'text-yellow-400', spin: true  },
  failed:     { label: 'Failed',     icon: AlertCircle,  color: 'text-red-400',    spin: false },
} as const;

function formatRelative(dateStr: string): string {
  try {
    // Backend returns UTC timestamps — append Z if missing so
    // the browser parses them as UTC instead of local time
    const utcStr = dateStr.endsWith('Z') ? dateStr : dateStr + 'Z';
    const diff   = Date.now() - new Date(utcStr).getTime();
    const mins   = Math.floor(diff / 60000);
    if (mins  <  1) return 'just now';
    if (mins  < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days  = Math.floor(hours / 24);
    if (days  <  7) return `${days}d ago`;
    return new Date(utcStr).toLocaleDateString();
  } catch { return ''; }
}

export default function DashboardPage() {
  const [repos, setRepos]               = useState<Repo[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');
  const [showUpload, setShowUpload]     = useState(false);
  const [uploadedRepoId, setUploadedRepoId] = useState<string | null>(null);

  const router = useRouter();
  const { pending, navigate } = useNavigateWithDelay({ minMs: 2000, maxMs: 6000 });
  const { latest, connected } = useWebSocket(uploadedRepoId);

  // ── Fetch repos ──────────────────────────────────────────────────────────
  const loadRepos = useCallback(() => {
    setLoading(true);
    setError('');
    getRepos()
      .then(res => {
        const data = res.data;
        const list: Repo[] = Array.isArray(data)
          ? data
          : Array.isArray(data?.repositories)
          ? data.repositories
          : Array.isArray(data?.repos)
          ? data.repos
          : [];
        setRepos(list);
      })
      .catch(() => setError('Failed to load repositories. Check your connection.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadRepos(); }, [loadRepos]);

  // Auto-refresh while any repo is still processing
  useEffect(() => {
    const processing = repos.some(r => r.status === 'pending' || r.status === 'extracting');
    if (!processing) return;
    const t = setInterval(loadRepos, 5000);
    return () => clearInterval(t);
  }, [repos, loadRepos]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleRepoClick = (repo: Repo) => {
    if (repo.status === 'failed') return;
    localStorage.setItem('helix_selected_repo_id',   repo.id);
    localStorage.setItem('helix_selected_repo_name', repo.name);
    navigate(`/repo/${repo.id}`);
  };

  const handleUploadComplete = (id: string) => {
    setUploadedRepoId(id);
    setShowUpload(false);
    setTimeout(loadRepos, 1500);
  };

  // Map WS message → ProcessingProgress shape
  const processingUpdate = latest ? {
    stage:    (latest.stage || 'parsing') as 'parsing' | 'analyzing' | 'graphing' | 'indexing' | 'complete',
    progress: latest.progress || 0,
    message:  latest.message  || '',
  } : null;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Repositories</h1>
                <p className="text-sm text-zinc-500 mt-0.5">
                  {loading ? 'Loading...' : `${repos.length} repo${repos.length !== 1 ? 's' : ''} indexed`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={loadRepos} className="w-8 h-8" title="Refresh">
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </Button>
                <Button onClick={() => setShowUpload(v => !v)} className="gap-2">
                  <Plus size={15} /> New repository
                </Button>
              </div>
            </div>

            {/* Upload panel */}
            <AnimatePresence>
              {showUpload && (
                <motion.div
                  initial={{ opacity: 0, y: -8, height: 0 }}
                  animate={{ opacity: 1, y: 0, height: 'auto' }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6">
                    <div className="text-sm font-medium text-zinc-300 mb-4 flex items-center gap-2">
                      <Upload size={14} className="text-indigo-400" />
                      Add repository
                    </div>
                    <div className="flex gap-6 items-start">
                      <RepoUploader onUploadComplete={handleUploadComplete} />
                      {uploadedRepoId && (
                        <div className="flex-1 min-w-0">
                          <ProcessingProgress update={processingUpdate} connected={connected} />
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error */}
            {error && !loading && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                <AlertCircle size={15} className="text-red-400 flex-shrink-0" />
                <span className="text-sm text-red-400 flex-1">{error}</span>
                <button onClick={loadRepos} className="text-xs text-red-400 hover:text-red-300 underline">Retry</button>
              </motion.div>
            )}

            {/* Loading skeletons */}
            {loading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-[72px] bg-[#0d0d14] border border-[#1e1e2e] rounded-xl animate-pulse" />
                ))}
              </div>
            )}

            {/* Repo list */}
            {!loading && !error && repos.length > 0 && (
              <div className="space-y-2">
                {repos.map((repo, i) => {
                  const cfg = STATUS_CONFIG[repo.status] ?? STATUS_CONFIG.pending;
                  const StatusIcon = cfg.icon;
                  const clickable = repo.status !== 'failed';

                  return (
                    <motion.div key={repo.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.04 }}>
                      <button
                        onClick={() => handleRepoClick(repo)}
                        disabled={!clickable}
                        className="w-full text-left disabled:cursor-not-allowed"
                      >
                        <div className={cn(
                          'flex items-center gap-4 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl px-5 py-4 transition-all group',
                          clickable ? 'hover:border-[#2e2e3e] hover:bg-[#12121a] cursor-pointer' : 'opacity-60'
                        )}>
                          <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                            <GitBranch size={15} className="text-indigo-400" />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className={cn(
                              'text-sm font-semibold transition-colors',
                              clickable ? 'text-white group-hover:text-indigo-300' : 'text-zinc-400'
                            )}>
                              {repo.name}
                            </div>
                            <div className="text-xs text-zinc-500 mt-0.5">
                              {repo.file_count} file{repo.file_count !== 1 ? 's' : ''}
                              {repo.function_count > 0 && ` · ${repo.function_count} functions`}
                            </div>
                          </div>

                          <div className={cn('flex items-center gap-1.5 text-xs font-medium', cfg.color)}>
                            <StatusIcon size={13} className={cfg.spin ? 'animate-spin' : ''} />
                            {cfg.label}
                          </div>

                          <div className="text-xs text-zinc-600 w-20 text-right flex-shrink-0">
                            {formatRelative(repo.updated_at)}
                          </div>
                        </div>
                      </button>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Empty state */}
            {!loading && !error && repos.length === 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-20">
                <div className="w-14 h-14 rounded-2xl bg-[#12121a] border border-[#1e1e2e] flex items-center justify-center mx-auto mb-4">
                  <Zap size={24} className="text-zinc-700" />
                </div>
                <div className="text-sm font-semibold text-zinc-500 mb-1">No repositories yet</div>
                <div className="text-xs text-zinc-700 mb-5">
                  No repositories yet. Upload your first one above.
                </div>
                <button onClick={() => setShowUpload(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors">
                  <Plus size={14} /> Add your first repository
                </button>
              </motion.div>
            )}

          </div>
        </div>
      </div>

      {/* Navigation loader overlay */}
      <AnimatePresence>
        {pending && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#0a0a0f]/95 backdrop-blur-sm">
            <HelixLoader label="Opening repository" sublabel="Loading dependency graph" icon={GitBranch} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}