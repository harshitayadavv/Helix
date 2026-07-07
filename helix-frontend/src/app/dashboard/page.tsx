'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GitBranch, Clock, CheckCircle2, AlertCircle, Plus, Zap, RefreshCw } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { RepoUploader } from '@/components/upload/RepoUploader';
import { ProcessingProgress } from '@/components/dashboard/ProcessingProgress';
import { HelixLoader } from '@/components/loading/HelixLoader';
import { Button } from '@/components/ui/button';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useNavigateWithDelay } from '@/hooks/useNavigateWithDelay';
import { useRepo } from '@/context/RepoContext';
import { getRepos } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Repo {
  id: string;
  name: string;
  language?: string;
  file_count?: number;
  status: 'ready' | 'processing' | 'error';
  updated_at?: string;
}

const STATUS_CONFIG = {
  ready: { label: 'Ready', icon: CheckCircle2, color: 'text-green-400' },
  processing: { label: 'Processing', icon: Clock, color: 'text-yellow-400' },
  error: { label: 'Error', icon: AlertCircle, color: 'text-red-400' },
};

const MOCK_REPOS: Repo[] = [
  { id: '1', name: 'helix-backend', language: 'Python', file_count: 42, status: 'ready', updated_at: '2 hours ago' },
  { id: '2', name: 'react-dashboard', language: 'TypeScript', file_count: 78, status: 'processing', updated_at: '10 min ago' },
  { id: '3', name: 'ml-pipeline', language: 'Python', file_count: 23, status: 'ready', updated_at: 'Yesterday' },
];

export default function DashboardPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadedRepoId, setUploadedRepoId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const { navigate, pending } = useNavigateWithDelay({ minMs: 2000, maxMs: 6000 });
  const { setSelectedRepo } = useRepo();
  const { latest, connected } = useWebSocket(uploadedRepoId);

  const loadRepos = () => {
    setLoading(true);
    getRepos()
      .then(r => setRepos(r.data?.repositories || r.data?.repos || MOCK_REPOS))
      .catch(() => setRepos(MOCK_REPOS))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadRepos(); }, []);

  const handleRepoClick = (repo: Repo) => {
    setSelectedRepo(repo.id, repo.name);
    navigate(`/repo/${repo.id}`);
  };

  const handleUploadComplete = (id: string) => {
    setUploadedRepoId(id);
    setShowUpload(false);
    loadRepos();
  };

  // Map WS message to ProcessingUpdate shape
  const processingUpdate = latest ? {
    stage: (latest.stage || 'parsing') as 'parsing' | 'analyzing' | 'graphing' | 'indexing' | 'complete',
    progress: latest.progress || 0,
    message: latest.message || '',
  } : null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Repositories</h1>
                <p className="text-sm text-zinc-500 mt-0.5">{repos.length} repos analyzed</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={loadRepos} className="w-8 h-8">
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                </Button>
                <Button onClick={() => setShowUpload(!showUpload)} className="gap-2">
                  <Plus size={15} /> New repository
                </Button>
              </div>
            </div>

            {showUpload && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6">
                <div className="text-sm font-medium text-zinc-300 mb-4">Upload repository ZIP</div>
                <div className="flex gap-6 items-start">
                  <RepoUploader onUploadComplete={handleUploadComplete} />
                  {uploadedRepoId && (
                    <div className="flex-1 min-w-0">
                      <ProcessingProgress update={processingUpdate} connected={connected} />
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            <div className="space-y-2">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-[72px] bg-[#0d0d14] border border-[#1e1e2e] rounded-xl animate-pulse" />
                ))
              ) : repos.map((repo, i) => {
                const status = repo.status as keyof typeof STATUS_CONFIG;
                const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ready;
                const StatusIcon = cfg.icon;
                return (
                  <motion.div key={repo.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <button onClick={() => handleRepoClick(repo)} className="w-full text-left">
                      <div className="flex items-center gap-4 bg-[#0d0d14] border border-[#1e1e2e] hover:border-[#2e2e3e] hover:bg-[#12121a] rounded-xl px-5 py-4 transition-all group cursor-pointer">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                          <GitBranch size={15} className="text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">{repo.name}</div>
                          <div className="text-xs text-zinc-500">{repo.language || 'Unknown'} · {repo.file_count || 0} files</div>
                        </div>
                        <div className={cn('flex items-center gap-1.5 text-xs', cfg.color)}>
                          <StatusIcon size={13} className={repo.status === 'processing' ? 'animate-spin' : ''} />
                          {cfg.label}
                        </div>
                        <div className="text-xs text-zinc-600 w-24 text-right">{repo.updated_at || ''}</div>
                      </div>
                    </button>
                  </motion.div>
                );
              })}

              {!loading && repos.length === 0 && (
                <div className="text-center py-16">
                  <div className="w-12 h-12 rounded-2xl bg-[#12121a] border border-[#1e1e2e] flex items-center justify-center mx-auto mb-3">
                    <Zap size={20} className="text-zinc-600" />
                  </div>
                  <div className="text-sm font-medium text-zinc-500 mb-1">No repositories yet</div>
                  <div className="text-xs text-zinc-700">Upload a ZIP to get started</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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
