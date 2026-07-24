'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, AlertTriangle, Play, RefreshCw, FileCode2, ChevronDown, ChevronRight } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { EmptyState } from '@/components/common/EmptyState';
import { getPerformance, runPerformance } from '@/lib/api';
import { useRepo } from '@/context/RepoContext';
import { cn } from '@/lib/utils';

interface PerfIssue {
  id: string;
  pattern_type: string;
  severity: 'high' | 'medium' | 'low';
  file_path: string;
  function_name: string;
  line_number: number;
  description: string;
  suggestion: string;
}

const MOCK_ISSUES: PerfIssue[] = [
  { id: '1', pattern_type: 'N+1 Query Pattern', severity: 'high', file_path: 'src/db/repo.py', function_name: 'get_users_with_posts', line_number: 87, description: 'Loop executes a DB query on each iteration — N queries for N users.', suggestion: 'Use JOIN or prefetch with IN clause to batch the queries.' },
  { id: '2', pattern_type: 'N+1 Query Pattern', severity: 'high', file_path: 'src/services.py', function_name: 'list_user_activities', line_number: 142, description: 'SQLAlchemy lazy loading inside a for loop causes N+1.', suggestion: 'Add .options(joinedload(...)) to the initial query.' },
  { id: '3', pattern_type: 'Blocking Async Call', severity: 'high', file_path: 'src/auth.py', function_name: 'send_verification_email', line_number: 203, description: 'Synchronous SMTP call blocks the async event loop.', suggestion: 'Use an async email library like aiosmtplib or offload to a task queue.' },
  { id: '4', pattern_type: 'Expensive Nested Loop', severity: 'medium', file_path: 'src/payments/risk.py', function_name: 'compute_risk_score', line_number: 56, description: 'O(n²) nested loop comparing transaction pairs.', suggestion: 'Use a hash map or sort + single-pass approach to reduce to O(n log n).' },
  { id: '5', pattern_type: 'Object Creation in Loop', severity: 'medium', file_path: 'src/models.py', function_name: 'batch_serialize', line_number: 31, description: 'New dict created inside loop on every iteration.', suggestion: 'Pre-allocate the list and use list comprehension or map().' },
  { id: '6', pattern_type: 'Blocking Async Call', severity: 'medium', file_path: 'src/utils.py', function_name: 'fetch_external_config', line_number: 18, description: 'requests.get() used inside an async function — blocks the loop.', suggestion: 'Replace with aiohttp.ClientSession for non-blocking HTTP.' },
  { id: '7', pattern_type: 'Object Creation in Loop', severity: 'low', file_path: 'src/middleware.py', function_name: 'log_request', line_number: 44, description: 'String concatenation in a loop builds up temporary objects.', suggestion: 'Use str.join() or an f-string built outside the loop.' },
];

const SEV_CONFIG = {
  high: { label: 'High', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  medium: { label: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  low: { label: 'Low', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
};

const PATTERN_COLORS: Record<string, string> = {
  'N+1 Query Pattern': '#ef4444',
  'Blocking Async Call': '#f97316',
  'Expensive Nested Loop': '#eab308',
  'Object Creation in Loop': '#3b82f6',
};

function SkeletonCard() {
  return (
    <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4 animate-pulse">
      <div className="flex items-start gap-3">
        <div className="w-6 h-6 rounded-lg bg-[#1e1e2e]" />
        <div className="flex-1 space-y-2">
          <div className="h-3 bg-[#1e1e2e] rounded w-3/4" />
          <div className="h-2.5 bg-[#1e1e2e] rounded w-1/2" />
          <div className="h-2.5 bg-[#1e1e2e] rounded w-full" />
        </div>
      </div>
    </div>
  );
}

export default function PerformancePage() {
  const [issues, setIssues] = useState<PerfIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [repoLoaded] = useState(true);
  const { selectedRepoId } = useRepo();

  const load = useCallback(() => {
    const id = selectedRepoId || '1';
    setLoading(true);
    getPerformance(id)
      .then(r => setIssues(r.data?.issues || MOCK_ISSUES))
      .catch(() => setIssues(MOCK_ISSUES))
      .finally(() => setLoading(false));
  }, [selectedRepoId]);

  useEffect(() => { if (repoLoaded) load(); }, [repoLoaded, load]);

  const run = async () => {
    setRunning(true);
    setIssues([]);
    try {
      await runPerformance(selectedRepoId || '1');
      await load();
    } catch {
      setIssues(MOCK_ISSUES);
    } finally {
      setRunning(false);
    }
  };

  const grouped = issues.reduce<Record<string, PerfIssue[]>>((acc, issue) => {
    if (!acc[issue.pattern_type]) acc[issue.pattern_type] = [];
    acc[issue.pattern_type].push(issue);
    return acc;
  }, {});

  const highCount = issues.filter(i => i.severity === 'high').length;
  const functionsAffected = new Set(issues.map(i => i.function_name)).size;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        {!repoLoaded ? (
          <EmptyState description="Upload a repository to detect N+1 queries, blocking async calls, and other performance anti-patterns." />
        ) : (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">

              {/* Hero stats */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Issues', value: issues.length, color: '#6366f1', icon: Zap },
                  { label: 'High Severity', value: highCount, color: '#ef4444', icon: AlertTriangle },
                  { label: 'Functions Affected', value: functionsAffected, color: '#f97316', icon: FileCode2 },
                ].map(({ label, value, color, icon: Icon }, i) => (
                  <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                    className="bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-5">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-3"
                      style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
                      <Icon size={15} style={{ color }} />
                    </div>
                    <div className="text-2xl font-bold text-white mb-0.5">{value}</div>
                    <div className="text-xs text-zinc-500">{label}</div>
                  </motion.div>
                ))}
              </div>

              {/* Run button */}
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-white">Issues by Pattern</div>
                <button onClick={run} disabled={running}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors">
                  {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
                  {running ? 'Analysing...' : 'Run Analysis'}
                </button>
              </div>

              {/* Grouped issues */}
              {loading || running ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(grouped).map(([pattern, items]) => (
                    <div key={pattern} className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl overflow-hidden">
                      {/* Pattern header */}
                      <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e2e]">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: PATTERN_COLORS[pattern] || '#6366f1' }} />
                        <span className="text-sm font-medium text-white">{pattern}</span>
                        <span className="text-xs text-zinc-600 ml-auto">{items.length} issue{items.length !== 1 ? 's' : ''}</span>
                      </div>

                      {/* Issues */}
                      {items.map(issue => {
                        const sev = SEV_CONFIG[issue.severity];
                        const open = expanded === issue.id;
                        return (
                          <div key={issue.id} className="border-b border-[#1e1e2e] last:border-0">
                            <button onClick={() => setExpanded(open ? null : issue.id)}
                              className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#12121a] transition-colors text-left">
                              <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border flex-shrink-0 mt-0.5', sev.bg, sev.border, sev.color)}>
                                {sev.label}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <code className="text-xs text-indigo-300">{issue.function_name}</code>
                                  <span className="text-[10px] text-zinc-600 font-mono">{issue.file_path}:{issue.line_number}</span>
                                </div>
                                <div className="text-xs text-zinc-500 truncate">{issue.description}</div>
                              </div>
                              {open ? <ChevronDown size={13} className="text-zinc-600 flex-shrink-0 mt-1" /> : <ChevronRight size={13} className="text-zinc-600 flex-shrink-0 mt-1" />}
                            </button>
                            <AnimatePresence>
                              {open && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                                  className="overflow-hidden">
                                  <div className="px-4 pb-3 ml-16">
                                    <div className="text-xs text-zinc-400 mb-2">{issue.description}</div>
                                    <div className="bg-[#12121a] border border-indigo-500/20 rounded-lg px-3 py-2">
                                      <span className="text-xs text-indigo-400 font-medium">Suggestion: </span>
                                      <span className="text-xs text-zinc-400">{issue.suggestion}</span>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
