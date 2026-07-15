'use client';
import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background, BackgroundVariant, MiniMap, ReactFlowProvider,
  Node, Edge, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileCode2, Code2, Box, Package, X, Zap, Route, RefreshCw } from 'lucide-react';
import { nodeTypes } from '@/components/graph/NodeTypes';
import { RepoEmptyState } from '@/components/common/RepoEmptyState';
import { getGraph, getRelationships } from '@/lib/api';
import { cn } from '@/lib/utils';

const TYPE_CONFIG = [
  { key: 'file', label: 'Files', icon: FileCode2, color: '#3b82f6' },
  { key: 'function', label: 'Functions', icon: Code2, color: '#22c55e' },
  { key: 'class', label: 'Classes', icon: Box, color: '#a855f7' },
  { key: 'module', label: 'Modules', icon: Package, color: '#f97316' },
];

const TYPE_COLOR: Record<string, string> = {
  // lowercase
  file: '#3b82f6', function: '#22c55e', class: '#a855f7', module: '#f97316',
  // capitalised (backend may return "File", "Function" etc)
  File: '#3b82f6', Function: '#22c55e', Class: '#a855f7', Module: '#f97316',
};

function findShortestPath(edges: Edge[], startId: string, endId: string): string[] {
  const graph: Record<string, string[]> = {};
  edges.forEach(e => {
    if (!graph[e.source]) graph[e.source] = [];
    if (!graph[e.target]) graph[e.target] = [];
    graph[e.source].push(e.target);
    graph[e.target].push(e.source);
  });
  const queue = [[startId]];
  const visited = new Set([startId]);
  while (queue.length) {
    const path = queue.shift()!;
    const node = path[path.length - 1];
    if (node === endId) return path;
    for (const neighbor of graph[node] || []) {
      if (!visited.has(neighbor)) { visited.add(neighbor); queue.push([...path, neighbor]); }
    }
  }
  return [];
}

function GraphInner({ repoId }: { repoId: string }) {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [baseEdges, setBaseEdges] = useState<Edge[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState(['file', 'function', 'class', 'module']);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [traceMode, setTraceMode] = useState(false);
  const [traceNodes, setTraceNodes] = useState<string[]>([]);
  const [tracePath, setTracePath] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const { fitView } = useReactFlow();

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      getGraph(repoId),
      getRelationships(repoId),
    ]).then(([nodesRes, edgesRes]) => {
      // ── Nodes ──
      const apiNodes: {
        id: string; name: string; type: string;
        file_path?: string; line_number?: number; language?: string;
      }[] = nodesRes.status === 'fulfilled'
        ? (nodesRes.value.data?.nodes || nodesRes.value.data || [])
        : [];

      const mapped: Node[] = apiNodes.map((n, i) => {
        // Backend returns type as "File", "Function" etc — normalise to lowercase
        const nodeType = (n.type || 'file').toLowerCase();
        return {
          id: n.id,
          type: 'helixNode',
          position: { x: (i % 6) * 220, y: Math.floor(i / 6) * 160 },
          data: {
            label:      n.name,
            nodeType,
            path:       n.file_path,
            lines:      n.line_number,
            color:      TYPE_COLOR[nodeType] || '#6366f1',
          },
        };
      });

      // ── Edges / Relationships ──
      const apiRels: {
        source_id: string; target_id: string; type?: string; relationship?: string;
      }[] = edgesRes.status === 'fulfilled'
        ? (edgesRes.value.data?.relationships || edgesRes.value.data || [])
        : [];

      const mappedEdges: Edge[] = apiRels.map(r => ({
        id:       `${r.source_id}-${r.target_id}-${r.type || r.relationship || ''}`,
        source:   r.source_id,
        target:   r.target_id,
        label:    r.type || r.relationship || '',
        type:     'smoothstep',
        animated: (r.type || r.relationship) === 'CALLS',
        style:    { stroke: '#2e2e3e', strokeWidth: 1.5 },
      }));

      setNodes(mapped);
      setEdges(mappedEdges);
      setBaseEdges(mappedEdges);
    })
    .finally(() => setLoading(false));
  }, [repoId]);

  useEffect(() => { load(); }, [load]);

  const filtered = nodes.filter(n =>
    activeFilters.includes(n.data.nodeType) &&
    (!search || n.data.label.toLowerCase().includes(search.toLowerCase()))
  );

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (traceMode) {
      setTraceNodes(prev => {
        if (prev.length === 0) return [node.id];
        if (prev.length === 1) {
          const path = findShortestPath(baseEdges, prev[0], node.id);
          setTracePath(path);
          setEdges(baseEdges.map(e => {
            const inPath = path.includes(e.source) && path.includes(e.target);
            return { ...e, style: { stroke: inPath ? '#ef4444' : '#1e1e2e', strokeWidth: inPath ? 3 : 1.5 } };
          }));
          return [...prev, node.id];
        }
        setTracePath([]); setEdges(baseEdges); return [node.id];
      });
    } else {
      setSelectedNode(node);
    }
  }, [traceMode, baseEdges]);

  const clearTrace = () => { setTraceNodes([]); setTracePath([]); setEdges(baseEdges); };

  const getDeps = (id: string) => baseEdges.filter(e => e.source === id).map(e => nodes.find(n => n.id === e.target)?.data.label).filter(Boolean);
  const getDependents = (id: string) => baseEdges.filter(e => e.target === id).map(e => nodes.find(n => n.id === e.source)?.data.label).filter(Boolean);

  if (!loading && nodes.length === 0) {
    return <RepoEmptyState icon={Package} title="No graph data yet" description="The repository graph hasn't been built yet. Try refreshing after the repository finishes processing." action={{ label: 'Refresh', onClick: load }} />;
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left panel */}
      <div className="w-64 flex-shrink-0 border-r border-[#1e1e2e] flex flex-col bg-[#0d0d14]">
        <div className="p-3 border-b border-[#1e1e2e]">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#12121a] border border-[#1e1e2e] rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/30" />
          </div>
        </div>

        <div className="p-3 border-b border-[#1e1e2e]">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Filter</div>
          {TYPE_CONFIG.map(({ key, label, icon: Icon, color }) => {
            const active = activeFilters.includes(key);
            return (
              <button key={key} onClick={() => setActiveFilters(prev => active ? prev.filter(f => f !== key) : [...prev, key])}
                className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors', active ? 'text-zinc-300' : 'text-zinc-600 hover:text-zinc-400')}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active ? color : '#2e2e3e' }} />
                <Icon size={11} style={{ color: active ? color : undefined }} /> {label}
                <span className="ml-auto text-zinc-700">{nodes.filter(n => n.data.nodeType === key).length}</span>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider px-2 mb-1">Nodes ({filtered.length})</div>
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 bg-[#12121a] rounded mb-1 animate-pulse" />)
          ) : filtered.map(node => (
            <button key={node.id} onClick={() => { setSelectedNode(node); fitView({ nodes: [node], padding: 0.5 }); }}
              className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors mb-0.5',
                selectedNode?.id === node.id ? 'bg-indigo-600/15 text-indigo-300' : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a25]')}>
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: node.data.color }} />
              <span className="truncate">{node.data.label}</span>
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-[#1e1e2e]">
          <button onClick={() => { setTraceMode(!traceMode); clearTrace(); }}
            className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
              traceMode ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-[#1a1a25] text-zinc-400 hover:text-zinc-300 border border-[#2e2e3e]')}>
            <Route size={13} /> {traceMode ? 'Path Trace ON' : 'Enable Path Tracing'}
          </button>
          {tracePath.length > 0 && (
            <div className="mt-1.5 text-[10px] text-zinc-500">
              {tracePath.length - 1} hops <button onClick={clearTrace} className="ml-1 text-red-400">clear</button>
            </div>
          )}
        </div>
      </div>

      {/* Graph canvas */}
      <div className="flex-1 relative min-w-0">
        {loading ? (
          <div className="flex items-center justify-center h-full gap-2">
            <RefreshCw size={18} className="text-indigo-400 animate-spin" />
            <span className="text-sm text-zinc-500">Loading graph...</span>
          </div>
        ) : (
          <>
            {traceMode && traceNodes.length < 2 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-red-500/15 border border-red-500/30 text-red-400 text-xs px-4 py-2 rounded-full">
                {traceNodes.length === 0 ? 'Click first node' : 'Click second node to trace path'}
              </div>
            )}
            <ReactFlow nodes={filtered} edges={edges} nodeTypes={nodeTypes}
              onNodesChange={(c: NodeChange[]) => setNodes(n => applyNodeChanges(c, n))}
              onEdgesChange={(c: EdgeChange[]) => setEdges(e => applyEdgeChanges(c, e))}
              onNodeClick={handleNodeClick}
              fitView fitViewOptions={{ padding: 0.15 }} minZoom={0.05} maxZoom={3}
              proOptions={{ hideAttribution: true }}>
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e1e2e" />
              <MiniMap nodeColor={n => n.data?.color || '#6366f1'} maskColor="rgba(10,10,15,0.85)"
                style={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: '8px' }} />
            </ReactFlow>
          </>
        )}
      </div>

      {/* Right detail */}
      <AnimatePresence>
        {selectedNode && !traceMode && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            className="flex-shrink-0 border-l border-[#1e1e2e] bg-[#0d0d14] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#1e1e2e] flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: selectedNode.data.color }} />
              <span className="text-xs font-medium text-zinc-400 uppercase">{selectedNode.data.nodeType}</span>
              <button onClick={() => setSelectedNode(null)} className="ml-auto"><X size={14} className="text-zinc-600 hover:text-zinc-400" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <div className="text-base font-bold text-white mb-1">{selectedNode.data.label}</div>
                {selectedNode.data.path && <div className="text-xs text-zinc-500 font-mono bg-[#12121a] rounded px-2 py-1">{selectedNode.data.path}</div>}
              </div>
              {selectedNode.data.lines && <div className="text-xs text-zinc-500 flex items-center gap-1.5"><Zap size={11} className="text-indigo-400" />{selectedNode.data.lines} lines</div>}
              <div>
                <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Dependencies ({getDeps(selectedNode.id).length})</div>
                {getDeps(selectedNode.id).length === 0 ? <div className="text-xs text-zinc-700">None</div>
                  : getDeps(selectedNode.id).map((d, i) => <div key={i} className="text-xs text-zinc-400 py-1 border-b border-[#1e1e2e] last:border-0">{d}</div>)}
              </div>
              <div>
                <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Dependents ({getDependents(selectedNode.id).length})</div>
                {getDependents(selectedNode.id).length === 0 ? <div className="text-xs text-zinc-700">None</div>
                  : getDependents(selectedNode.id).map((d, i) => <div key={i} className="text-xs text-zinc-400 py-1 border-b border-[#1e1e2e] last:border-0">{d}</div>)}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function GraphPage({ params }: { params: { id: string } }) {
  return (
    <ReactFlowProvider>
      <div className="flex flex-1 min-h-0 flex-col">
        <GraphInner repoId={params.id} />
      </div>
    </ReactFlowProvider>
  );
}
