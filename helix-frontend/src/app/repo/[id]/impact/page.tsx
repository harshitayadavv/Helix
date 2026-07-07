'use client';
import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, AlertTriangle, Trash2, FileCode2, Code2, Box, Package, RefreshCw } from 'lucide-react';
import { RepoEmptyState } from '@/components/common/RepoEmptyState';
import { getGraphNodes, runImpact } from '@/lib/api';
import { cn } from '@/lib/utils';

interface GraphNode { id: string; name: string; type: 'file'|'function'|'class'|'module'; path: string; }
interface ImpactResult {
  direct_dependents: string[]; indirect_dependents: string[];
  potentially_affected: string[]; broken_endpoints: string[];
  risk_score: 'Low'|'Medium'|'High'|'Critical'; summary?: string;
}

const RISK_CONFIG = {
  Low: 'text-green-400 bg-green-500/10 border-green-500/20',
  Medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  High: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  Critical: 'text-red-400 bg-red-500/10 border-red-500/20',
};
const TYPE_ICON = { file: FileCode2, function: Code2, class: Box, module: Package };
const TYPE_COLOR = { file: '#3b82f6', function: '#22c55e', class: '#a855f7', module: '#f97316' };
const RINGS = [
  { key: 'direct_dependents' as const, label: 'Direct', color: '#ef4444', ring: 130 },
  { key: 'indirect_dependents' as const, label: 'Indirect', color: '#f97316', ring: 220 },
  { key: 'potentially_affected' as const, label: 'Potential', color: '#eab308', ring: 310 },
];

export default function ImpactPage({ params }: { params: { id: string } }) {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<GraphNode | null>(null);
  const [impact, setImpact] = useState<ImpactResult | null>(null);
  const [running, setRunning] = useState(false);
  const [nodesLoading, setNodesLoading] = useState(true);

  useEffect(() => {
    setNodesLoading(true);
    getGraphNodes(params.id)
      .then(r => setNodes(r.data?.nodes || []))
      .catch(() => setNodes([]))
      .finally(() => setNodesLoading(false));
  }, [params.id]);

  const analyse = useCallback(async () => {
    if (!selected) return;
    setRunning(true); setImpact(null);
    try {
      const r = await runImpact(params.id, selected.id, selected.type);
      setImpact(r.data);
    } catch { setImpact(null); }
    finally { setRunning(false); }
  }, [selected, params.id]);

  const filtered = nodes.filter(n => !search || n.name.toLowerCase().includes(search.toLowerCase()));
  const Icon = selected ? TYPE_ICON[selected.type] : FileCode2;

  if (!nodesLoading && nodes.length === 0) {
    return (
      <div className="flex flex-1 min-h-0 items-center justify-center">
        <RepoEmptyState icon={Package} title="No nodes found" description="The repository graph hasn't been built yet. Process the repository first." />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left */}
      <div className="w-60 flex-shrink-0 border-r border-[#1e1e2e] flex flex-col bg-[#0d0d14]">
        <div className="p-3 border-b border-[#1e1e2e]">
          <div className="text-xs font-medium text-zinc-500 mb-2">Select a node</div>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#12121a] border border-[#1e1e2e] rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/30" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {nodesLoading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-10 bg-[#12121a] rounded mb-1 animate-pulse" />) :
            filtered.map(node => {
              const NIcon = TYPE_ICON[node.type];
              const color = TYPE_COLOR[node.type];
              return (
                <button key={node.id} onClick={() => { setSelected(node); setImpact(null); }}
                  className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left mb-1 transition-colors',
                    selected?.id === node.id ? 'bg-indigo-600/15 border border-indigo-500/20' : 'hover:bg-[#1a1a25]')}>
                  <NIcon size={13} style={{ color }} />
                  <div className="flex-1 min-w-0">
                    <div className={cn('text-xs font-medium truncate', selected?.id === node.id ? 'text-indigo-300' : 'text-zinc-300')}>{node.name}</div>
                    <div className="text-[10px] text-zinc-600 truncate">{node.path}</div>
                  </div>
                </button>
              );
            })
          }
        </div>
        {selected && (
          <div className="p-3 border-t border-[#1e1e2e]">
            <button onClick={analyse} disabled={running}
              className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-colors disabled:opacity-50">
              {running ? <RefreshCw size={13} className="animate-spin" /> : <Trash2 size={13} />}
              {running ? 'Analysing...' : 'What if I delete this?'}
            </button>
          </div>
        )}
      </div>

      {/* Center */}
      <div className="flex-1 flex items-center justify-center relative bg-[#0a0a0f] min-w-0">
        {!selected ? (
          <div className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#12121a] border border-[#1e1e2e] flex items-center justify-center mx-auto mb-3">
              <FileCode2 size={28} className="text-zinc-700" />
            </div>
            <div className="text-sm text-zinc-600">Select a node to see its blast radius</div>
          </div>
        ) : (
          <div className="relative flex items-center justify-center" style={{ width: 680, height: 680 }}>
            <AnimatePresence>
              {(impact || running) && RINGS.map(({ color, ring }, i) => (
                <motion.div key={ring} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: running ? 0.25 : 0.15 }} exit={{ scale: 0, opacity: 0 }}
                  transition={{ delay: i * 0.18, duration: 0.5 }}
                  className="absolute rounded-full border-2"
                  style={{ width: ring * 2, height: ring * 2, borderColor: color }} />
              ))}
            </AnimatePresence>
            <motion.div animate={running ? { scale: [1, 1.1, 1] } : { scale: 1 }} transition={{ repeat: running ? Infinity : 0, duration: 0.8 }}
              className="relative z-10 flex flex-col items-center justify-center w-28 h-28 rounded-2xl border-2"
              style={{ background: `${TYPE_COLOR[selected.type]}15`, borderColor: TYPE_COLOR[selected.type] }}>
              <Icon size={24} style={{ color: TYPE_COLOR[selected.type] }} />
              <div className="text-xs font-bold text-white mt-1 text-center px-2 leading-tight">{selected.name}</div>
              <div className="text-[9px] text-zinc-500 mt-0.5">{selected.type}</div>
            </motion.div>
            <AnimatePresence>
              {impact && RINGS.map(({ key, color, ring }, ri) =>
                impact[key].map((label, ni) => {
                  const total = impact[key].length;
                  const angle = (ni / total) * 2 * Math.PI - Math.PI / 2;
                  return (
                    <motion.div key={`${key}-${ni}`} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0 }}
                      transition={{ delay: ri * 0.2 + ni * 0.07 }}
                      className="absolute flex items-center justify-center px-2 py-1 rounded-lg text-[10px] font-medium border"
                      style={{ transform: `translate(calc(-50% + ${Math.cos(angle) * ring}px), calc(-50% + ${Math.sin(angle) * ring}px))`, background: `${color}15`, borderColor: `${color}40`, color, whiteSpace: 'nowrap' }}>
                      {label}
                    </motion.div>
                  );
                })
              )}
            </AnimatePresence>
            {impact && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
                {RINGS.map(({ label, color }) => (
                  <div key={label} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />{label}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right panel */}
      <AnimatePresence>
        {impact && selected && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            className="flex-shrink-0 border-l border-[#1e1e2e] bg-[#0d0d14] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#1e1e2e]">
              <div className="text-sm font-semibold text-white mb-1">Impact Summary</div>
              <div className="text-xs text-zinc-500">Deleting <span className="text-indigo-300">{selected.name}</span></div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
              <div>
                <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Risk Level</div>
                <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border', RISK_CONFIG[impact.risk_score])}>
                  <AlertTriangle size={11} />{impact.risk_score}
                </span>
              </div>
              {RINGS.map(({ key, label, color }) => {
                const items = impact[key];
                return items.length > 0 && (
                  <div key={key}>
                    <div className="text-[10px] font-medium uppercase tracking-wider mb-2" style={{ color }}>{label} dependents</div>
                    {items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2 py-1 border-b border-[#1e1e2e] last:border-0">
                        <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                        <span className="text-xs text-zinc-400">{item}</span>
                      </div>
                    ))}
                  </div>
                );
              })}
              {impact.broken_endpoints.length > 0 && (
                <div>
                  <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Broken Endpoints</div>
                  {impact.broken_endpoints.map((ep, i) => (
                    <div key={i} className="text-xs text-red-400 font-mono bg-red-500/5 border border-red-500/15 rounded px-2 py-1 mb-1">{ep}</div>
                  ))}
                </div>
              )}
              {impact.summary && (
                <div>
                  <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">AI Summary</div>
                  <div className="text-xs text-zinc-400 leading-relaxed bg-[#12121a] border border-[#1e1e2e] rounded-lg px-3 py-2">{impact.summary}</div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
