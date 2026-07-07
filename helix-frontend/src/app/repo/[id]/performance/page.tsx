'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, AlertTriangle, Play, RefreshCw, FileCode2, ChevronDown, ChevronRight } from 'lucide-react';
import { RepoEmptyState } from '@/components/common/RepoEmptyState';
import { getPerformance, runPerformance } from '@/lib/api';
import { cn } from '@/lib/utils';

interface PerfIssue {
  id: string; pattern_type: string; severity: 'high'|'medium'|'low';
  file_path: string; function_name: string; line_number: number;
  description: string; suggestion: string;
}

const SEV_CONFIG = {
  high: { label: 'High', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
  medium: { label: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  low: { label: 'Low', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
};
const PATTERN_COLORS: Record<string, string> = {
  'N+1 Query Pattern': '#ef4444', 'Blocking Async Call': '#f97316',
  'Expensive Nested Loop': '#eab308', 'Object Creation in Loop': '#3b82f6',
};

export default function PerformancePage({ params }: { params: { id: string } }) {
  const [issues, setIssues] = useState<PerfIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    getPerformance(params.id)
      .then(r => setIssues(r.data?.issues || []))
      .catch(() => setIssues([]))
      .finally(() => setLoading(false));
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const run = async () => {
    setRunning(true); setIssues([]);
    try { await runPerformance(params.id); await load(); }
    catch { setIssues([]); }
    finally { setRunning(false); }
  };

  const grouped = issues.reduce<Record<string, PerfIssue[]>>((acc, issue) => {
    if (!acc[issue.pattern_type]) acc[issue.pattern_type] = [];
    acc[issue.pattern_type].push(issue);
    return acc;
  }, {});

  const highCount = issues.filter(i => i.severity === 'high').length;
  const functionsAffected = new Set(issues.map(i => i.function_name)).size;

  return (
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

        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-white">Issues by Pattern</div>
          <button onClick={run} disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors">
            {running ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
            {running ? 'Analysing...' : 'Run Analysis'}
          </button>
        </div>

        {loading || running ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl animate-pulse" />)}</div>
        ) : issues.length === 0 ? (
          <RepoEmptyState icon={Zap} title="No performance issues found" description='Click "Run Analysis" to scan for N+1 queries, blocking calls, and other patterns.' action={{ label: 'Run Analysis', onClick: run }} />
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([pattern, items]) => (
              <div key={pattern} className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 border-b border-[#1e1e2e]">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: PATTERN_COLORS[pattern] || '#6366f1' }} />
                  <span className="text-sm font-medium text-white">{pattern}</span>
                  <span className="text-xs text-zinc-600 ml-auto">{items.length} issue{items.length !== 1 ? 's' : ''}</span>
                </div>
                {items.map(issue => {
                  const sev = SEV_CONFIG[issue.severity];
                  const open = expanded === issue.id;
                  return (
                    <div key={issue.id} className="border-b border-[#1e1e2e] last:border-0">
                      <button onClick={() => setExpanded(open ? null : issue.id)}
                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#12121a] transition-colors text-left">
                        <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded border flex-shrink-0 mt-0.5', sev.bg, sev.border, sev.color)}>{sev.label}</span>
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
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
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
  );
}
