'use client';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GitCommit, Clock, FileCode2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { RepoEmptyState } from '@/components/common/RepoEmptyState';
import { getCommits, getHotspots, getContributors } from '@/lib/api';
import { cn } from '@/lib/utils';

interface Commit { hash: string; author: string; message: string; timestamp: string; files_changed: number; }
interface Hotspot { file: string; changes: number; }
interface Contributor { name: string; commits: number; files_owned: string[]; }

const AVATAR_COLORS = ['bg-indigo-600', 'bg-purple-600', 'bg-blue-600', 'bg-green-600'];
function initials(name: string) { return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2); }

export default function TimelinePage({ params }: { params: { id: string } }) {
  const [commits, setCommits] = useState<Commit[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([getCommits(params.id), getHotspots(params.id), getContributors(params.id)])
      .then(([c, h, co]) => {
        if (c.status === 'fulfilled') setCommits(c.value.data?.commits || []);
        if (h.status === 'fulfilled') setHotspots(h.value.data?.hotspots || []);
        if (co.status === 'fulfilled') setContributors(co.value.data?.contributors || []);
      })
      .finally(() => setLoading(false));
  }, [params.id]);

  if (!loading && commits.length === 0) {
    return <div className="flex-1 flex items-center justify-center"><RepoEmptyState icon={GitCommit} title="No commit history" description="Timeline requires Git history. Clone a repository from GitHub to see commits, hotspots, and contributors." /></div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-3 gap-6">
          {/* Timeline */}
          <div className="col-span-2">
            <div className="text-sm font-semibold text-white mb-4">Commit History</div>
            {loading ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl animate-pulse mb-3" />) : (
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-[#1e1e2e]" />
                {commits.map((commit, i) => (
                  <motion.div key={commit.hash} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="relative flex gap-4 mb-4">
                    <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center z-10">
                      <div className="w-3 h-3 rounded-full bg-indigo-600 border-2 border-[#0a0a0f]" />
                    </div>
                    <div className="flex-1 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl px-4 py-3 hover:border-[#2e2e3e] transition-colors">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0', AVATAR_COLORS[i % AVATAR_COLORS.length])}>
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

          {/* Right panels */}
          <div className="space-y-5">
            <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-4">
              <div className="text-xs font-semibold text-white mb-3">🔥 Hotspot Files</div>
              {loading ? <div className="h-48 bg-[#12121a] rounded animate-pulse" /> : hotspots.length === 0 ? (
                <div className="text-xs text-zinc-600 text-center py-8">No hotspot data</div>
              ) : (
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
              )}
            </div>

            <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-4">
              <div className="text-xs font-semibold text-white mb-3">Contributors</div>
              {loading ? <div className="h-32 bg-[#12121a] rounded animate-pulse" /> : contributors.length === 0 ? (
                <div className="text-xs text-zinc-600 text-center py-6">No contributor data</div>
              ) : (
                <div className="space-y-3">
                  {contributors.map((c, i) => (
                    <div key={c.name} className="flex items-start gap-3">
                      <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0', AVATAR_COLORS[i % AVATAR_COLORS.length])}>
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
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
