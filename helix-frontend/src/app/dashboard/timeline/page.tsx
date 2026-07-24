'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GitCommit, Clock, FileCode2, ChevronDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { EmptyState } from '@/components/common/EmptyState';
import { getCommits, getHotspots, getContributors } from '@/lib/api';
import { useRepo } from '@/context/RepoContext';
import { cn } from '@/lib/utils';

interface Commit {
  hash: string;
  author: string;
  message: string;
  timestamp: string;
  files_changed: number;
}
interface Hotspot { file: string; changes: number; }
interface Contributor { name: string; commits: number; files_owned: string[]; }

const MOCK_COMMITS: Commit[] = [
  { hash: 'a3f9c1b', author: 'Harshita Y', message: 'feat: add JWT refresh token support', timestamp: '2 hours ago', files_changed: 4 },
  { hash: 'b7d2e8a', author: 'Rahul K', message: 'fix: resolve N+1 query in UserService', timestamp: '5 hours ago', files_changed: 2 },
  { hash: 'c1e4f2d', author: 'Priya S', message: 'refactor: extract payment logic into service', timestamp: 'Yesterday', files_changed: 7 },
  { hash: 'd9a3b5c', author: 'Harshita Y', message: 'chore: update dependencies', timestamp: '2 days ago', files_changed: 1 },
  { hash: 'e2f7c9a', author: 'Rahul K', message: 'feat: implement rate limiting middleware', timestamp: '3 days ago', files_changed: 3 },
  { hash: 'f5b1d4e', author: 'Priya S', message: 'test: add auth unit tests', timestamp: '4 days ago', files_changed: 5 },
  { hash: 'g8e2a6f', author: 'Harshita Y', message: 'docs: update API documentation', timestamp: '5 days ago', files_changed: 2 },
];
const MOCK_HOTSPOTS: Hotspot[] = [
  { file: 'src/auth.py', changes: 34 },
  { file: 'src/services.py', changes: 28 },
  { file: 'src/db/repo.py', changes: 21 },
  { file: 'src/middleware.py', changes: 18 },
  { file: 'src/models.py', changes: 15 },
  { file: 'src/app.py', changes: 12 },
  { file: 'src/utils.py', changes: 9 },
];
const MOCK_CONTRIBUTORS: Contributor[] = [
  { name: 'Harshita Y', commits: 42, files_owned: ['auth.py', 'middleware.py', 'utils.py'] },
  { name: 'Rahul K', commits: 31, files_owned: ['db/repo.py', 'services.py'] },
  { name: 'Priya S', commits: 24, files_owned: ['models.py', 'payments/'] },
];

const REPOS = [
  { id: '1', name: 'helix-backend' },
  { id: '2', name: 'react-dashboard' },
];

function initials(name: string) {
  return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

const AVATAR_COLORS = ['bg-indigo-600', 'bg-purple-600', 'bg-blue-600', 'bg-green-600'];

export default function TimelinePage() {
  const { selectedRepoId } = useRepo();
  const [repoId, setRepoId] = useState(selectedRepoId || '1');
  const [commits, setCommits] = useState<Commit[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRepoMenu, setShowRepoMenu] = useState(false);
  const [repoLoaded] = useState(true);

  useEffect(() => {
    if (!repoLoaded) return;
    setLoading(true);
    Promise.allSettled([
      getCommits(repoId),
      getHotspots(repoId),
      getContributors(repoId),
    ]).then(([c, h, co]) => {
      setCommits(c.status === 'fulfilled' ? c.value.data?.commits || MOCK_COMMITS : MOCK_COMMITS);
      setHotspots(h.status === 'fulfilled' ? h.value.data?.hotspots || MOCK_HOTSPOTS : MOCK_HOTSPOTS);
      setContributors(co.status === 'fulfilled' ? co.value.data?.contributors || MOCK_CONTRIBUTORS : MOCK_CONTRIBUTORS);
    }).finally(() => setLoading(false));
  }, [repoId, repoLoaded]);

  const selectedRepo = REPOS.find(r => r.id === repoId);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        {!repoLoaded ? (
          <EmptyState description="Upload a repository to see commit history, hotspot files, and contributor activity." />
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">

              {/* Repo selector */}
              <div className="relative inline-block">
                <button onClick={() => setShowRepoMenu(!showRepoMenu)}
                  className="flex items-center gap-2 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl px-4 py-2 text-sm text-zinc-300 hover:border-indigo-500/30 transition-colors">
                  <GitCommit size={13} className="text-indigo-400" />
                  {selectedRepo?.name}
                  <ChevronDown size={12} className="text-zinc-500" />
                </button>
                {showRepoMenu && (
                  <div className="absolute top-full mt-1 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl py-1 z-10 shadow-xl min-w-[180px]">
                    {REPOS.map(r => (
                      <button key={r.id} onClick={() => { setRepoId(r.id); setShowRepoMenu(false); }}
                        className={cn('w-full text-left px-3 py-2 text-sm hover:bg-[#1a1a25] transition-colors',
                          r.id === repoId ? 'text-indigo-300' : 'text-zinc-400')}>
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-6">
                {/* Timeline */}
                <div className="col-span-2 space-y-1">
                  <div className="text-sm font-semibold text-white mb-4">Commit History</div>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-20 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl animate-pulse mb-3" />
                    ))
                  ) : (
                    <div className="relative">
                      {/* Vertical line */}
                      <div className="absolute left-5 top-0 bottom-0 w-px bg-[#1e1e2e]" />
                      {commits.map((commit, i) => (
                        <motion.div key={commit.hash}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="relative flex gap-4 mb-4"
                        >
                          {/* Dot */}
                          <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center z-10">
                            <div className="w-3 h-3 rounded-full bg-indigo-600 border-2 border-[#0a0a0f]" />
                          </div>
                          {/* Card */}
                          <div className="flex-1 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl px-4 py-3 hover:border-[#2e2e3e] transition-colors">
                            <div className="flex items-start gap-3">
                              <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0',
                                AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                                {initials(commit.author)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-sm text-white font-medium leading-snug mb-1">{commit.message}</div>
                                <div className="flex items-center gap-3 text-[11px] text-zinc-600">
                                  <span className="font-mono text-indigo-400">{commit.hash}</span>
                                  <span>{commit.author}</span>
                                  <span className="flex items-center gap-1"><Clock size={9} />{commit.timestamp}</span>
                                  <span className="flex items-center gap-1"><FileCode2 size={9} />{commit.files_changed} files</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right panel */}
                <div className="space-y-5">
                  {/* Hotspots */}
                  <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-4">
                    <div className="text-xs font-semibold text-white mb-3">🔥 Hotspot Files</div>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={hotspots} layout="vertical">
                          <XAxis type="number" tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="file" tick={{ fill: '#71717a', fontSize: 9 }} axisLine={false} tickLine={false} width={90} />
                          <Tooltip contentStyle={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 11 }} />
                          <Bar dataKey="changes" fill="#f97316" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Contributors */}
                  <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-4">
                    <div className="text-xs font-semibold text-white mb-3">Contributors</div>
                    <div className="space-y-3">
                      {contributors.map((c, i) => (
                        <div key={c.name} className="flex items-start gap-3">
                          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0',
                            AVATAR_COLORS[i % AVATAR_COLORS.length])}>
                            {initials(c.name)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-zinc-300">{c.name}</span>
                              <span className="text-[10px] text-zinc-600">{c.commits} commits</span>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {c.files_owned.map(f => (
                                <span key={f} className="text-[9px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5">{f}</span>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
