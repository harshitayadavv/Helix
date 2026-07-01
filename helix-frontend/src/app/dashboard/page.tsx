'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { GitBranch, Clock, CheckCircle2, AlertCircle, Plus, Zap } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { RepoUploader } from '@/components/upload/RepoUploader';
import { ProcessingProgress } from '@/components/dashboard/ProcessingProgress';
import { Button } from '@/components/ui/button';
import { useWebSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';

const MOCK_REPOS = [
  { id: '1', name: 'helix-backend', language: 'Python', files: 42, status: 'ready', updated: '2 hours ago' },
  { id: '2', name: 'react-dashboard', language: 'TypeScript', files: 78, status: 'processing', updated: '10 min ago' },
  { id: '3', name: 'ml-pipeline', language: 'Python', files: 23, status: 'ready', updated: 'Yesterday' },
];

const STATUS_CONFIG = {
  ready: { label: 'Ready', icon: CheckCircle2, color: 'text-green-400' },
  processing: { label: 'Processing', icon: Clock, color: 'text-yellow-400' },
  error: { label: 'Error', icon: AlertCircle, color: 'text-red-400' },
};

export default function DashboardPage() {
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null);
  const [showUpload, setShowUpload] = useState(false);
  const wsUrl = activeRepoId
    ? `${process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'}/ws/repos/${activeRepoId}/progress`
    : null;
  const { latest, connected } = useWebSocket(wsUrl);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar breadcrumbs={[{ label: 'Dashboard' }]} />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-white">Repositories</h1>
                <p className="text-sm text-zinc-500 mt-0.5">{MOCK_REPOS.length} repos analyzed</p>
              </div>
              <Button onClick={() => setShowUpload(!showUpload)} className="gap-2">
                <Plus size={15} /> New repository
              </Button>
            </div>

            {showUpload && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6">
                <div className="text-sm font-medium text-zinc-300 mb-4">Upload repository ZIP</div>
                <div className="flex gap-6 items-start">
                  <RepoUploader onUploadComplete={(id) => { setActiveRepoId(id); setShowUpload(false); }} />
                  {activeRepoId && (
                    <div className="flex-1 min-w-0">
                      <ProcessingProgress update={latest} connected={connected} />
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            <div className="space-y-2">
              {MOCK_REPOS.map((repo, i) => {
                const cfg = STATUS_CONFIG[repo.status as keyof typeof STATUS_CONFIG];
                const StatusIcon = cfg.icon;
                return (
                  <motion.div key={repo.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                    <Link href={`/repo/${repo.id}`}>
                      <div className="flex items-center gap-4 bg-[#0d0d14] border border-[#1e1e2e] hover:border-[#2e2e3e] hover:bg-[#12121a] rounded-xl px-5 py-4 transition-all group cursor-pointer">
                        <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                          <GitBranch size={15} className="text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-semibold text-white group-hover:text-indigo-300 transition-colors">{repo.name}</div>
                          <div className="text-xs text-zinc-500">{repo.language} · {repo.files} files</div>
                        </div>
                        <div className={cn('flex items-center gap-1.5 text-xs', cfg.color)}>
                          <StatusIcon size={13} className={repo.status === 'processing' ? 'animate-spin' : ''} />
                          {cfg.label}
                        </div>
                        <div className="text-xs text-zinc-600 w-24 text-right">{repo.updated}</div>
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>

            {MOCK_REPOS.length === 0 && (
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
  );
}