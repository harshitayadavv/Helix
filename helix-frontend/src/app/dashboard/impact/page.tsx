'use client';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Zap, AlertTriangle, Trash2, FileCode2, Code2, Box, Package } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { EmptyState } from '@/components/common/EmptyState';
import { cn } from '@/lib/utils';

const NODES = [
  { id: '1', name: 'auth.py', type: 'file' as const, path: 'src/auth.py' },
  { id: '2', name: 'UserService', type: 'class' as const, path: 'src/services.py' },
  { id: '3', name: 'parse_token', type: 'function' as const, path: 'src/utils.py' },
  { id: '4', name: 'validate_user', type: 'function' as const, path: 'src/auth.py' },
  { id: '5', name: 'models.py', type: 'file' as const, path: 'src/models.py' },
  { id: '6', name: 'middleware.py', type: 'file' as const, path: 'src/middleware.py' },
  { id: '7', name: 'AuthHandler', type: 'class' as const, path: 'src/auth.py' },
  { id: '8', name: 'Repository', type: 'class' as const, path: 'src/db/repo.py' },
];

const IMPACT_DATA: Record<string, {
  ring1: string[]; ring2: string[]; ring3: string[];
  endpoints: string[]; risk: 'Low' | 'Medium' | 'High' | 'Critical';
}> = {
  '1': {
    ring1: ['middleware.py', 'AuthHandler', 'validate_user'],
    ring2: ['app.py', 'UserService', 'Repository'],
    ring3: ['config.py', 'database', 'all API routes'],
    endpoints: ['POST /auth/login', 'POST /auth/logout', 'GET /users/me'],
    risk: 'Critical',
  },
  '3': {
    ring1: ['AuthHandler', 'validate_user'],
    ring2: ['middleware.py', 'app.py'],
    ring3: ['all protected routes'],
    endpoints: ['POST /auth/login'],
    risk: 'High',
  },
  '2': {
    ring1: ['UserService consumers', 'models.py'],
    ring2: ['app.py', 'Repository'],
    ring3: ['dashboard routes'],
    endpoints: ['GET /users/:id', 'PUT /users/:id'],
    risk: 'Medium',
  },
};

const DEFAULT_IMPACT = { ring1: ['No direct dependents'], ring2: [], ring3: [], endpoints: [], risk: 'Low' as const };

const RISK_CONFIG = {
  Low: 'text-green-400 bg-green-500/10 border-green-500/20',
  Medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  High: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  Critical: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const TYPE_ICON = { file: FileCode2, function: Code2, class: Box, module: Package };
const TYPE_COLOR = { file: '#3b82f6', function: '#22c55e', class: '#a855f7', module: '#f97316' };

const RINGS = [
  { key: 'ring1' as const, label: 'Direct dependents', color: '#ef4444', ring: 130 },
  { key: 'ring2' as const, label: 'Indirect dependents', color: '#f97316', ring: 220 },
  { key: 'ring3' as const, label: 'Potentially affected', color: '#eab308', ring: 310 },
];

const [REPO_LOADED] = [true];

export default function ImpactPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<typeof NODES[0] | null>(null);
  const [analysed, setAnalysed] = useState(false);
  const [running, setRunning] = useState(false);

  const filtered = NODES.filter(n =>
    !search || n.name.toLowerCase().includes(search.toLowerCase())
  );

  const impact = selected ? (IMPACT_DATA[selected.id] || DEFAULT_IMPACT) : null;

  const runAnalysis = () => {
    if (!selected) return;
    setRunning(true);
    setAnalysed(false);
    setTimeout(() => { setRunning(false); setAnalysed(true); }, 1800);
  };

  const Icon = selected ? TYPE_ICON[selected.type] : FileCode2;

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar breadcrumbs={[{ label: 'Impact Analysis' }]} />
        {!REPO_LOADED ? (
          <EmptyState description="Select a file or function to see which parts of your codebase would break if it changed or was deleted." />
        ) : (
          <div className="flex flex-1 min-h-0">
            {/* Left: selector */}
            <div className="w-60 flex-shrink-0 border-r border-[#1e1e2e] flex flex-col bg-[#0d0d14]">
              <div className="p-3 border-b border-[#1e1e2e]">
                <div className="text-xs font-medium text-zinc-500 mb-2">Select a node to analyse</div>
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search nodes..."
                    className="w-full pl-8 pr-3 py-1.5 bg-[#12121a] border border-[#1e1e2e] rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/30" />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {filtered.map(node => {
                  const NIcon = TYPE_ICON[node.type];
                  const color = TYPE_COLOR[node.type];
                  return (
                    <button key={node.id} onClick={() => { setSelected(node); setAnalysed(false); }}
                      className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left mb-1 transition-colors',
                        selected?.id === node.id ? 'bg-indigo-600/15 border border-indigo-500/20' : 'hover:bg-[#1a1a25]')}>
                      <NIcon size={13} style={{ color }} />
                      <div className="flex-1 min-w-0">
                        <div className={cn('text-xs font-medium truncate', selected?.id === node.id ? 'text-indigo-300' : 'text-zinc-300')}>
                          {node.name}
                        </div>
                        <div className="text-[10px] text-zinc-600 truncate">{node.path}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selected && (
                <div className="p-3 border-t border-[#1e1e2e]">
                  <button onClick={runAnalysis} disabled={running}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg text-xs font-medium transition-colors">
                    <Trash2 size={13} />
                    {running ? 'Analysing...' : 'What if I delete this?'}
                  </button>
                </div>
              )}
            </div>

            {/* Center: blast radius */}
            <div className="flex-1 flex items-center justify-center relative bg-[#0a0a0f] min-w-0">
              {!selected ? (
                <div className="text-center">
                  <div className="w-16 h-16 rounded-2xl bg-[#12121a] border border-[#1e1e2e] flex items-center justify-center mx-auto mb-3">
                    <Zap size={28} className="text-zinc-700" />
                  </div>
                  <div className="text-sm text-zinc-600">Select a node on the left to see its blast radius</div>
                </div>
              ) : (
                <div className="relative flex items-center justify-center" style={{ width: 680, height: 680 }}>
                  {/* Concentric rings */}
                  <AnimatePresence>
                    {(analysed || running) && RINGS.map(({ color, ring }, i) => (
                      <motion.div key={ring}
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: running ? 0.3 : 0.15 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ delay: i * 0.18, duration: 0.5 }}
                        className="absolute rounded-full border-2"
                        style={{ width: ring * 2, height: ring * 2, borderColor: color }}
                      />
                    ))}
                  </AnimatePresence>

                  {/* Center node */}
                  <motion.div
                    animate={running ? { scale: [1, 1.1, 1] } : { scale: 1 }}
                    transition={{ repeat: running ? Infinity : 0, duration: 0.8 }}
                    className="relative z-10 flex flex-col items-center justify-center w-28 h-28 rounded-2xl border-2"
                    style={{ background: `${TYPE_COLOR[selected.type]}15`, borderColor: TYPE_COLOR[selected.type] }}
                  >
                    <Icon size={24} style={{ color: TYPE_COLOR[selected.type] }} />
                    <div className="text-xs font-bold text-white mt-1 text-center px-2 leading-tight">{selected.name}</div>
                    <div className="text-[9px] text-zinc-500 mt-0.5">{selected.type}</div>
                  </motion.div>

                  {/* Ring nodes */}
                  <AnimatePresence>
                    {analysed && impact && RINGS.map(({ key, color, ring }, ri) =>
                      impact[key].map((label, ni) => {
                        const total = impact[key].length;
                        const angle = (ni / total) * 2 * Math.PI - Math.PI / 2;
                        const x = Math.cos(angle) * ring;
                        const y = Math.sin(angle) * ring;
                        return (
                          <motion.div key={`${key}-${ni}`}
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0 }}
                            transition={{ delay: ri * 0.2 + ni * 0.07 }}
                            className="absolute flex items-center justify-center px-2 py-1 rounded-lg text-[10px] font-medium border"
                            style={{
                              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                              background: `${color}15`, borderColor: `${color}40`, color,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {label}
                          </motion.div>
                        );
                      })
                    )}
                  </AnimatePresence>

                  {/* Ring legend */}
                  {analysed && (
                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
                      {RINGS.map(({ label, color }) => (
                        <div key={label} className="flex items-center gap-1.5 text-[10px] text-zinc-500">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                          {label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: summary */}
            <AnimatePresence>
              {analysed && impact && selected && (
                <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                  className="flex-shrink-0 border-l border-[#1e1e2e] bg-[#0d0d14] flex flex-col overflow-hidden">
                  <div className="p-4 border-b border-[#1e1e2e]">
                    <div className="text-sm font-semibold text-white mb-1">Impact Summary</div>
                    <div className="text-xs text-zinc-500">Deleting <span className="text-indigo-300">{selected.name}</span></div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-5">
                    <div>
                      <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Risk Level</div>
                      <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border', RISK_CONFIG[impact.risk])}>
                        <AlertTriangle size={11} />
                        {impact.risk}
                      </span>
                    </div>
                    {['ring1', 'ring2', 'ring3'].map((key, i) => {
                      const items = impact[key as keyof typeof impact] as string[];
                      const labels = ['Direct dependents', 'Indirect dependents', 'Potentially affected'];
                      const colors = ['text-red-400', 'text-orange-400', 'text-yellow-400'];
                      return items.length > 0 && (
                        <div key={key}>
                          <div className={cn('text-[10px] font-medium uppercase tracking-wider mb-2', colors[i])}>{labels[i]}</div>
                          {items.map((item, j) => (
                            <div key={j} className="flex items-center gap-2 py-1 border-b border-[#1e1e2e] last:border-0">
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ['#ef4444', '#f97316', '#eab308'][i] }} />
                              <span className="text-xs text-zinc-400">{item}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                    {impact.endpoints.length > 0 && (
                      <div>
                        <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Broken Endpoints</div>
                        {impact.endpoints.map((ep, i) => (
                          <div key={i} className="text-xs text-red-400 font-mono bg-red-500/5 border border-red-500/15 rounded px-2 py-1 mb-1">{ep}</div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
