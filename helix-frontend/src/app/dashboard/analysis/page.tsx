'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Info, XCircle, Play, CheckCircle2, RefreshCw } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { cn } from '@/lib/utils';

const SUB_SCORES = [
  { label: 'Architecture', score: 78, color: '#6366f1', desc: 'Good separation of concerns' },
  { label: 'Maintainability', score: 65, color: '#3b82f6', desc: 'Some complex modules detected' },
  { label: 'Complexity', score: 54, color: '#f97316', desc: 'High cyclomatic complexity in auth' },
  { label: 'Security', score: 82, color: '#22c55e', desc: 'No critical vulnerabilities' },
  { label: 'Performance', score: 71, color: '#a855f7', desc: 'N+1 query risk in Repository' },
  { label: 'Documentation', score: 41, color: '#ef4444', desc: 'Low docstring coverage' },
];

const ISSUES = [
  { severity: 'critical', file: 'src/auth.py', title: 'No rate limiting on login endpoint', fix: 'Add rate limiting middleware to /auth/login route', line: 45 },
  { severity: 'critical', file: 'src/db/repo.py', title: 'N+1 query detected in get_users()', fix: 'Use select_related() or batch fetch with IN clause', line: 87 },
  { severity: 'warning', file: 'src/services.py', title: 'God Class: UserService has 24 methods', fix: 'Split into UserQueryService and UserMutationService', line: 1 },
  { severity: 'warning', file: 'src/utils.py', title: 'hash_password uses deprecated MD5', fix: 'Switch to bcrypt or argon2 for password hashing', line: 12 },
  { severity: 'warning', file: 'src/middleware.py', title: 'Exception swallowed silently', fix: 'Add proper logging and re-raise or return error response', line: 34 },
  { severity: 'info', file: 'src/config.py', title: 'Hardcoded timeout value (30s)', fix: 'Move to environment variable CONFIG_TIMEOUT', line: 8 },
  { severity: 'info', file: 'src/app.py', title: 'Missing docstrings on 8 public functions', fix: 'Add Google-style docstrings to all public functions', line: 1 },
  { severity: 'info', file: 'src/models.py', title: 'Unused import: datetime', fix: 'Remove unused import to reduce module load time', line: 3 },
];

const SEVERITY = {
  critical: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', label: 'Critical' },
  warning: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', label: 'Warning' },
  info: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', label: 'Info' },
};

const ANALYSIS_STEPS = ['Parsing files...', 'Analyzing complexity...', 'Checking security...', 'Measuring coverage...', 'Generating report...'];

function CircularScore({ score }: { score: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  const color = score >= 75 ? '#22c55e' : score >= 50 ? '#f97316' : '#ef4444';

  return (
    <div className="relative w-36 h-36">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} fill="none" stroke="#1e1e2e" strokeWidth="10" />
        <motion.circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round" strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - progress }}
          transition={{ duration: 1.5, ease: 'easeOut', delay: 0.3 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
          className="text-4xl font-bold text-white">{score}</motion.span>
        <span className="text-xs text-zinc-500">/ 100</span>
      </div>
    </div>
  );
}

export default function AnalysisPage() {
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(false);
  const [filterSeverity, setFilterSeverity] = useState<string | null>(null);
  const overallScore = Math.round(SUB_SCORES.reduce((a, s) => a + s.score, 0) / SUB_SCORES.length);

  const runAnalysis = () => {
    setRunning(true);
    setDone(false);
    setStep(0);
    let s = 0;
    const iv = setInterval(() => {
      s++;
      setStep(s);
      if (s >= ANALYSIS_STEPS.length) {
        clearInterval(iv);
        setRunning(false);
        setDone(true);
      }
    }, 700);
  };

  const filtered = filterSeverity ? ISSUES.filter(i => i.severity === filterSeverity) : ISSUES;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar breadcrumbs={[{ label: 'Code Analysis' }]} />
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto space-y-6">

            {/* Hero score + run button */}
            <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-6 flex items-center gap-8">
              <CircularScore score={overallScore} />
              <div className="flex-1">
                <div className="text-2xl font-bold text-white mb-1">Project Health</div>
                <div className="text-sm text-zinc-500 mb-4">helix-backend · Last analyzed 2 hours ago</div>
                <div className="flex items-center gap-3">
                  <button onClick={runAnalysis} disabled={running}
                    className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                      running ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 cursor-not-allowed'
                              : 'bg-indigo-600 hover:bg-indigo-500 text-white')}>
                    {running ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                    {running ? 'Analyzing...' : 'Run Analysis'}
                  </button>
                  {done && (
                    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      className="flex items-center gap-1.5 text-sm text-green-400">
                      <CheckCircle2 size={14} /> Analysis complete
                    </motion.div>
                  )}
                </div>

                {/* Progress steps */}
                <AnimatePresence>
                  {running && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="mt-4 space-y-1.5">
                      {ANALYSIS_STEPS.map((s, i) => (
                        <div key={s} className={cn('flex items-center gap-2 text-xs transition-colors',
                          i < step ? 'text-green-400' : i === step ? 'text-indigo-400' : 'text-zinc-700')}>
                          {i < step ? <CheckCircle2 size={11} /> : i === step ? <RefreshCw size={11} className="animate-spin" /> : <div className="w-2.5 h-2.5 rounded-full border border-zinc-700" />}
                          {s}
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Sub-scores grid */}
            <div className="grid grid-cols-3 gap-3">
              {SUB_SCORES.map(({ label, score, color, desc }, i) => (
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

            {/* Issues list */}
            <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-[#1e1e2e] flex items-center gap-3">
                <span className="text-sm font-semibold text-white">Issues</span>
                <span className="text-xs text-zinc-500">{ISSUES.length} found</span>
                <div className="ml-auto flex items-center gap-2">
                  {['critical', 'warning', 'info'].map(s => {
                    const cfg = SEVERITY[s as keyof typeof SEVERITY];
                    const count = ISSUES.filter(i => i.severity === s).length;
                    return (
                      <button key={s} onClick={() => setFilterSeverity(filterSeverity === s ? null : s)}
                        className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs border transition-colors',
                          filterSeverity === s ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'border-[#1e1e2e] text-zinc-500 hover:text-zinc-400')}>
                        {count} {cfg.label}
                      </button>
                    );
                  })}
                  {filterSeverity && (
                    <button onClick={() => setFilterSeverity(null)} className="text-zinc-600 hover:text-zinc-400">
                      <XCircle size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-[#1e1e2e]">
                {filtered.map((issue, i) => {
                  const cfg = SEVERITY[issue.severity as keyof typeof SEVERITY];
                  const Icon = cfg.icon;
                  return (
                    <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}
                      className="px-5 py-4 hover:bg-[#12121a] transition-colors">
                      <div className="flex items-start gap-3">
                        <div className={cn('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg, `border ${cfg.border}`)}>
                          <Icon size={12} className={cfg.color} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-sm font-medium text-white">{issue.title}</span>
                          </div>
                          <div className="text-xs text-zinc-500 font-mono mb-2">{issue.file}:{issue.line}</div>
                          <div className="text-xs text-zinc-600 bg-[#12121a] border border-[#1e1e2e] rounded-lg px-3 py-2">
                            <span className="text-zinc-500">Fix: </span>{issue.fix}
                          </div>
                        </div>
                        <span className={cn('text-[10px] px-2 py-0.5 rounded border flex-shrink-0', cfg.bg, cfg.border, cfg.color)}>
                          {cfg.label}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
