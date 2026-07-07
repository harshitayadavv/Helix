'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, XCircle, Play, CheckCircle2, RefreshCw, Shield, Code2, BarChart2 } from 'lucide-react';
import { RepoEmptyState } from '@/components/common/RepoEmptyState';
import { getHealth, runHealth, getSecurity, runSecurity, getSmells, runSmells } from '@/lib/api';
import { cn } from '@/lib/utils';

interface SubScore { label: string; score: number; color: string; desc: string; }
interface HealthData { overall: number; sub_scores: SubScore[]; }
interface SecurityFinding { severity: 'critical'|'high'|'medium'|'low'; file_path: string; title: string; description: string; suggestion: string; line?: number; }
interface CodeSmell { smell_type: string; node_name: string; file_path: string; suggestion: string; severity: string; }

const SEV: Record<string, { icon: typeof XCircle; color: string; bg: string; border: string }> = {
  critical: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  high: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
  medium: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  low: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
};

const STEPS = ['Parsing files...', 'Analysing complexity...', 'Checking security...', 'Detecting smells...', 'Generating report...'];
const TABS = [{ label: 'Health Score', icon: BarChart2 }, { label: 'Security', icon: Shield }, { label: 'Code Smells', icon: Code2 }];

function CircularScore({ score }: { score: number }) {
  const r = 54; const circ = 2 * Math.PI * r;
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f97316' : '#ef4444';
  return (
    <div className="relative w-36 h-36">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} fill="none" stroke="#1e1e2e" strokeWidth="10" />
        <motion.circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circ} initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (score / 100) * circ }} transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold text-white">{score}</span>
        <span className="text-xs text-zinc-500">/ 100</span>
      </div>
    </div>
  );
}

export default function AnalysisPage({ params }: { params: { id: string } }) {
  const [tab, setTab] = useState(0);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [security, setSecurity] = useState<SecurityFinding[]>([]);
  const [smells, setSmells] = useState<CodeSmell[]>([]);
  const [running, setRunning] = useState(false);
  const [runStep, setRunStep] = useState(0);
  const [done, setDone] = useState(false);
  const [filterSev, setFilterSev] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const loadAll = useCallback(() => {
    Promise.allSettled([getHealth(params.id), getSecurity(params.id), getSmells(params.id)])
      .then(([h, s, sm]) => {
        if (h.status === 'fulfilled' && h.value.data) setHealth(h.value.data);
        if (s.status === 'fulfilled' && s.value.data) setSecurity(s.value.data?.findings || []);
        if (sm.status === 'fulfilled' && sm.value.data) setSmells(sm.value.data?.smells || []);
      })
      .finally(() => setInitialLoading(false));
  }, [params.id]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const runAll = async () => {
    setRunning(true); setDone(false); setRunStep(0);
    let s = 0;
    const iv = setInterval(() => { s++; setRunStep(s); if (s >= STEPS.length) clearInterval(iv); }, 700);
    try {
      await Promise.allSettled([runHealth(params.id), runSecurity(params.id), runSmells(params.id)]);
      await loadAll();
    } catch { /* ignore */ }
    clearInterval(iv); setRunning(false); setDone(true);
  };

  const filteredSecurity = filterSev ? security.filter(s => s.severity === filterSev) : security;

  if (initialLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Run button */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-5">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <div className="text-sm font-semibold text-white mb-1">Run Full Analysis</div>
              <div className="text-xs text-zinc-500">Health score, security scan, and code smell detection.</div>
            </div>
            <div className="flex items-center gap-3">
              {done && <div className="flex items-center gap-1.5 text-sm text-green-400"><CheckCircle2 size={14} />Complete</div>}
              <button onClick={runAll} disabled={running}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors">
                {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
                {running ? 'Running...' : 'Run Analysis'}
              </button>
            </div>
          </div>
          <AnimatePresence>
            {running && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="mt-4 space-y-1.5 overflow-hidden">
                {STEPS.map((step, i) => (
                  <div key={step} className={cn('flex items-center gap-2 text-xs transition-colors',
                    i < runStep ? 'text-green-400' : i === runStep ? 'text-indigo-400' : 'text-zinc-700')}>
                    {i < runStep ? <CheckCircle2 size={11} /> : i === runStep ? <RefreshCw size={11} className="animate-spin" /> : <div className="w-2.5 h-2.5 rounded-full border border-zinc-700" />}
                    {step}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-[#1e1e2e]">
          {TABS.map(({ label, icon: Icon }, i) => (
            <button key={label} onClick={() => setTab(i)}
              className={cn('flex items-center gap-2 px-4 py-3 text-sm border-b-2 transition-colors',
                tab === i ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {/* Tab 0: Health */}
            {tab === 0 && (
              health ? (
                <div className="space-y-5">
                  <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6 flex items-center gap-8">
                    <CircularScore score={health.overall} />
                    <div>
                      <div className="text-xl font-bold text-white mb-1">Project Health</div>
                      <div className="text-sm text-zinc-500">Overall score</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {(health.sub_scores || []).map(({ label, score, color, desc }, i) => (
                      <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                        className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-zinc-300">{label}</span>
                          <span className="text-sm font-bold" style={{ color }}>{score}</span>
                        </div>
                        <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden mb-2">
                          <motion.div className="h-full rounded-full" style={{ background: color }}
                            initial={{ width: '0%' }} animate={{ width: `${score}%` }} transition={{ duration: 1, delay: 0.2 + i * 0.07 }} />
                        </div>
                        <div className="text-[11px] text-zinc-600">{desc}</div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ) : (
                <RepoEmptyState icon={BarChart2} title="No health data yet" description='Click "Run Analysis" to generate a health score for this repository.' />
              )
            )}

            {/* Tab 1: Security */}
            {tab === 1 && (
              security.length > 0 ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-500">{security.length} findings</span>
                    <div className="ml-auto flex items-center gap-2">
                      {['critical','high','medium','low'].map(s => {
                        const cfg = SEV[s]; const count = security.filter(f => f.severity === s).length;
                        if (!count) return null;
                        return (
                          <button key={s} onClick={() => setFilterSev(filterSev === s ? null : s)}
                            className={cn('text-xs px-2.5 py-1 rounded-lg border transition-colors',
                              filterSev === s ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'border-[#1e1e2e] text-zinc-600 hover:text-zinc-400')}>
                            {count} {s}
                          </button>
                        );
                      })}
                      {filterSev && <button onClick={() => setFilterSev(null)} className="text-xs text-zinc-600 hover:text-zinc-400">clear</button>}
                    </div>
                  </div>
                  <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl divide-y divide-[#1e1e2e]">
                    {filteredSecurity.map((f, i) => {
                      const cfg = SEV[f.severity] || SEV.low; const Icon = cfg.icon;
                      return (
                        <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                          className="px-5 py-4 hover:bg-[#12121a] transition-colors">
                          <div className="flex items-start gap-3">
                            <div className={cn('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg, `border ${cfg.border}`)}>
                              <Icon size={12} className={cfg.color} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-white mb-0.5">{f.title}</div>
                              <div className="text-xs text-zinc-500 font-mono mb-2">{f.file_path}{f.line ? `:${f.line}` : ''}</div>
                              <div className="text-xs text-zinc-600 mb-1">{f.description}</div>
                              <div className="text-xs bg-[#12121a] border border-[#1e1e2e] rounded-lg px-3 py-2"><span className="text-zinc-500">Fix: </span>{f.suggestion}</div>
                            </div>
                            <span className={cn('text-[10px] px-2 py-0.5 rounded border flex-shrink-0 capitalize', cfg.bg, cfg.border, cfg.color)}>{f.severity}</span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <RepoEmptyState icon={Shield} title="No security findings" description='Run Analysis to scan for security vulnerabilities.' />
              )
            )}

            {/* Tab 2: Smells */}
            {tab === 2 && (
              smells.length > 0 ? (
                <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl divide-y divide-[#1e1e2e]">
                  {smells.map((smell, i) => {
                    const cfg = SEV[smell.severity] || SEV.info; const Icon = cfg.icon;
                    return (
                      <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.05 }}
                        className="px-5 py-4 hover:bg-[#12121a] transition-colors">
                        <div className="flex items-start gap-3">
                          <div className={cn('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg, `border ${cfg.border}`)}>
                            <Icon size={12} className={cfg.color} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium text-white">{smell.node_name}</span>
                              <span className="text-[10px] text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded px-1.5 py-0.5">{smell.smell_type}</span>
                            </div>
                            <div className="text-xs text-zinc-600 font-mono mb-2">{smell.file_path}</div>
                            <div className="text-xs bg-[#12121a] border border-[#1e1e2e] rounded-lg px-3 py-2"><span className="text-zinc-500">Fix: </span>{smell.suggestion}</div>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              ) : (
                <RepoEmptyState icon={Code2} title="No code smells detected" description='Run Analysis to detect God Classes, long methods, and other patterns.' />
              )
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
