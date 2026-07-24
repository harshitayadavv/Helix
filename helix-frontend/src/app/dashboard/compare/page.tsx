'use client';
import { useState } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { GitBranch, ChevronDown, Plus, Minus, Equal } from 'lucide-react';

import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { cn } from '@/lib/utils';

const REPOS = [
  { id: '1', name: 'helix-backend', stats: { files: 42, functions: 87, classes: 12, deps: 89, health: 65 } },
  { id: '2', name: 'react-dashboard', stats: { files: 78, functions: 134, classes: 8, deps: 203, health: 81 } },
  { id: '3', name: 'ml-pipeline', stats: { files: 23, functions: 56, classes: 4, deps: 41, health: 72 } },
];

const METRICS = [
  { key: 'files' as const, label: 'Files' },
  { key: 'functions' as const, label: 'Functions' },
  { key: 'classes' as const, label: 'Classes' },
  { key: 'deps' as const, label: 'Dependencies' },
  { key: 'health' as const, label: 'Health Score' },
];

const NODES_A = ['auth.py', 'UserService', 'parse_token', 'middleware.py', 'AuthHandler', 'validate_user', 'models.py'];
const NODES_B = ['auth.py', 'UserService', 'Dashboard', 'NavBar', 'ThemeProvider', 'validate_user', 'ApiClient'];

function RepoSelector({ value, onChange }: { value: typeof REPOS[0] | null; onChange: (r: typeof REPOS[0]) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 bg-[#12121a] border border-[#1e1e2e] rounded-xl px-4 py-2.5 text-sm text-zinc-300 hover:border-indigo-500/30 transition-colors min-w-[200px]">
        <GitBranch size={13} className="text-indigo-400" />
        <span className="flex-1 text-left">{value?.name || 'Select repository'}</span>
        <ChevronDown size={13} className="text-zinc-500" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 w-full bg-[#12121a] border border-[#1e1e2e] rounded-xl py-1 z-10 shadow-xl">
          {REPOS.map(r => (
            <button key={r.id} onClick={() => { onChange(r); setOpen(false); }}
              className={cn('w-full text-left px-3 py-2 text-sm hover:bg-[#1a1a25] transition-colors',
                value?.id === r.id ? 'text-indigo-300' : 'text-zinc-400')}>
              {r.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ComparePage() {
  const [repoA, setRepoA] = useState<typeof REPOS[0] | null>(REPOS[0]);
  const [repoB, setRepoB] = useState<typeof REPOS[0] | null>(REPOS[1]);

  const chartData = METRICS.map(({ key, label }) => ({
    label,
    A: repoA?.stats[key] || 0,
    B: repoB?.stats[key] || 0,
  }));

  const onlyA = NODES_A.filter(n => !NODES_B.includes(n));
  const onlyB = NODES_B.filter(n => !NODES_A.includes(n));
  const shared = NODES_A.filter(n => NODES_B.includes(n));

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">

            {/* Selectors */}
            <div className="flex items-center gap-4">
              <RepoSelector value={repoA} onChange={setRepoA} />
              <div className="text-zinc-600 font-medium">vs</div>
              <RepoSelector value={repoB} onChange={setRepoB} />
            </div>

            {repoA && repoB && (
              <>
                {/* Metrics side-by-side */}
                <div className="grid grid-cols-5 gap-3">
                  {METRICS.map(({ key, label }, i) => {
                    const a = repoA.stats[key];
                    const b = repoB.stats[key];
                    const diff = a - b;
                    return (
                      <motion.div key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                        className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4 text-center">
                        <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-3">{label}</div>
                        <div className="flex items-center justify-center gap-2 mb-2">
                          <div className="text-lg font-bold text-indigo-300">{a}</div>
                          <div className="text-zinc-700">·</div>
                          <div className="text-lg font-bold text-purple-300">{b}</div>
                        </div>
                        <div className={cn('flex items-center justify-center gap-1 text-[11px]',
                          diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-zinc-600')}>
                          {diff > 0 ? <Plus size={10} /> : diff < 0 ? <Minus size={10} /> : <Equal size={10} />}
                          {Math.abs(diff)}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Bar chart */}
                <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-5">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="text-sm font-semibold text-white">Metrics comparison</div>
                    <div className="flex items-center gap-4 ml-auto">
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <div className="w-3 h-3 rounded bg-indigo-500" />{repoA.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
                        <div className="w-3 h-3 rounded bg-purple-500" />{repoB.name}
                      </div>
                    </div>
                  </div>
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} barGap={4}>
                        <XAxis dataKey="label" tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 12 }}
                          labelStyle={{ color: '#a1a1aa' }}
                        />
                        <Bar dataKey="A" radius={[4, 4, 0, 0]} fill="#6366f1" />
                        <Bar dataKey="B" radius={[4, 4, 0, 0]} fill="#a855f7" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Diff view */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-indigo-400" />
                      <div className="text-xs font-medium text-zinc-400">Only in {repoA.name}</div>
                      <span className="ml-auto text-xs text-zinc-600">{onlyA.length}</span>
                    </div>
                    {onlyA.map(n => (
                      <div key={n} className="flex items-center gap-2 py-1 text-xs text-indigo-300 border-b border-[#1e1e2e] last:border-0">
                        <Plus size={10} className="text-indigo-500" />{n}
                      </div>
                    ))}
                  </div>
                  <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-green-400" />
                      <div className="text-xs font-medium text-zinc-400">Shared nodes</div>
                      <span className="ml-auto text-xs text-zinc-600">{shared.length}</span>
                    </div>
                    {shared.map(n => (
                      <div key={n} className="flex items-center gap-2 py-1 text-xs text-green-400 border-b border-[#1e1e2e] last:border-0">
                        <Equal size={10} className="text-green-600" />{n}
                      </div>
                    ))}
                  </div>
                  <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 rounded-full bg-purple-400" />
                      <div className="text-xs font-medium text-zinc-400">Only in {repoB.name}</div>
                      <span className="ml-auto text-xs text-zinc-600">{onlyB.length}</span>
                    </div>
                    {onlyB.map(n => (
                      <div key={n} className="flex items-center gap-2 py-1 text-xs text-purple-300 border-b border-[#1e1e2e] last:border-0">
                        <Plus size={10} className="text-purple-500" />{n}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
