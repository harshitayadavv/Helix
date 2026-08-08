'use client';
import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background, BackgroundVariant, MiniMap, Controls, ReactFlowProvider,
  Node, Edge, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges,
  useReactFlow, useOnViewportChange,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileCode2, Code2, Box, Package, X, Zap, Route, RefreshCw } from 'lucide-react';
import dagre from 'dagre';
import { nodeTypes } from '@/components/graph/NodeTypes';
import { RepoEmptyState } from '@/components/common/RepoEmptyState';
import { getGraph, getRelationships } from '@/lib/api';
import { cn } from '@/lib/utils';

const NODE_W = 190;
const NODE_H = 64;

/**
 * Lays out nodes using only the hierarchy-defining edges (CONTAINS),
 * so File > Class > Function reads like a tree. Other edge types
 * (CALLS, IMPORTS, INHERITS) are drawn afterwards on top of these
 * stable positions instead of influencing layout, which is what
 * causes the tangled/crisscrossing look.
 */
function layoutGraph(nodes: Node[], hierarchyEdges: Edge[]): Node[] {
  // Nodes that never appear in a CONTAINS edge (typically external
  // Module nodes) have no parent/child relationship to lay out at
  // all. Feeding them into dagre alongside the real tree puts them
  // all on rank 0 next to the tree root, which reads as one long
  // horizontal strip. Instead, lay out only the connected tree with
  // dagre, then place the disconnected nodes in their own grid
  // cluster underneath it.
  const participantIds = new Set<string>();
  hierarchyEdges.forEach(e => { participantIds.add(e.source); participantIds.add(e.target); });

  const treeNodes = nodes.filter(n => participantIds.has(n.id));
  const isolatedNodes = nodes.filter(n => !participantIds.has(n.id));

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 90 });
  treeNodes.forEach(n => g.setNode(n.id, { width: NODE_W, height: NODE_H }));
  hierarchyEdges.forEach(e => g.setEdge(e.source, e.target));
  dagre.layout(g);

  let maxY = 0;
  const positionedTree = treeNodes.map(n => {
    const pos = g.node(n.id);
    if (!pos) return n;
    maxY = Math.max(maxY, pos.y);
    return { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - NODE_H / 2 } };
  });

  const isolatedY = maxY + NODE_H + 140;
  const cols = Math.max(1, Math.ceil(Math.sqrt(isolatedNodes.length)));
  const positionedIsolated = isolatedNodes.map((n, i) => ({
    ...n,
    position: {
      x: (i % cols) * (NODE_W + 40),
      y: isolatedY + Math.floor(i / cols) * (NODE_H + 40),
    },
  }));

  return [...positionedTree, ...positionedIsolated];
}

const TYPE_CONFIG = [
  { key: 'file',     label: 'Files',     icon: FileCode2, color: '#3b82f6' },
  { key: 'function', label: 'Functions', icon: Code2,     color: '#22c55e' },
  { key: 'class',    label: 'Classes',   icon: Box,       color: '#a855f7' },
  { key: 'module',   label: 'Modules',   icon: Package,   color: '#f97316' },
];

const TYPE_COLOR: Record<string, string> = {
  file: '#3b82f6',     function: '#22c55e', class: '#a855f7',  module: '#f97316',
  File: '#3b82f6',     Function: '#22c55e', Class: '#a855f7',  Module: '#f97316',
};

const REL_CONFIG = [
  { key: 'CONTAINS', label: 'Contains', color: '#64748b' },
  { key: 'CALLS',    label: 'Calls',    color: '#22c55e' },
  { key: 'IMPORTS',  label: 'Imports',  color: '#f97316' },
  { key: 'INHERITS', label: 'Inherits', color: '#a855f7' },
];
const REL_COLOR: Record<string, string> = Object.fromEntries(REL_CONFIG.map(r => [r.key, r.color]));

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
  const [nodes, setNodes]           = useState<Node[]>([]);
  const [edges, setEdges]           = useState<Edge[]>([]);
  const [baseEdges, setBaseEdges]   = useState<Edge[]>([]);
  const [search, setSearch]         = useState('');
  const [activeFilters, setActiveFilters] = useState(['file', 'function', 'class', 'module', 'File', 'Function', 'Class', 'Module']);
  const [activeRelFilters, setActiveRelFilters] = useState(['CALLS', 'IMPORTS', 'INHERITS']);
  const [selectedNode, setSelectedNode]   = useState<Node | null>(null);
  const [traceMode, setTraceMode]   = useState(false);
  const [traceNodes, setTraceNodes] = useState<string[]>([]);
  const [tracePath, setTracePath]   = useState<string[]>([]);
  const [loading, setLoading]       = useState(true);
  const [zoomPct, setZoomPct]       = useState(100);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const { fitView, zoomIn, zoomOut, setViewport, getViewport } = useReactFlow();

  useOnViewportChange({
    onChange: (viewport) => setZoomPct(Math.round(viewport.zoom * 100)),
  });

  const zoomTo100 = useCallback(() => {
    const { x, y } = getViewport();
    setViewport({ x, y, zoom: 1 }, { duration: 200 });
  }, [getViewport, setViewport]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.allSettled([
      getGraph(repoId),
      getRelationships(repoId),
    ]).then(([nodesRes, edgesRes]) => {
      // ── Nodes ──────────────────────────────────────────────────────────
const rawData = nodesRes.status === 'fulfilled'
  ? (nodesRes.value.data?.nodes || nodesRes.value.data || [])
  : [];

// Handle both wrapped {n, labels} format AND flat format
const apiNodes = rawData.map((item: any) => {
  // Backend wraps each node as { n: {...properties}, labels: [...] }
  if (item.n) {
    const props = item.n;
    const label = item.labels?.[0] || 'File';
    return {
      id: props.id || props.path || props.name || Math.random().toString(),
      name: props.name || props.path?.split('\\').pop()?.split('/').pop() || 'unknown',
      type: label,
      file_path: props.path || props.file_path || '',
      line_number: props.start_line || props.loc || 0,
    };
  }
  // Already flat format
  return item;
});

const unpositioned: Node[] = apiNodes.map((node: any) => {
  const nodeType = node.type || 'File';
  return {
    id: node.id,
    type: 'helixNode',
    position: { x: 0, y: 0 }, // placeholder — dagre fills this in below
    data: {
      label: node.name,
      nodeType,
      path: node.file_path,
      lines: node.line_number,
      color: TYPE_COLOR[nodeType] || '#6366f1',
    },
  };
});
      // ── Edges ──────────────────────────────────────────────────────────
      const apiRels: {
        source_id: string; target_id: string; type?: string; relationship?: string;
      }[] = edgesRes.status === 'fulfilled'
        ? (edgesRes.value.data?.relationships || edgesRes.value.data || [])
        : [];

      const mappedEdges: Edge[] = apiRels.map(r => {
        const relType = r.type || r.relationship || '';
        return {
          id:       `${r.source_id}-${r.target_id}-${relType}`,
          source:   r.source_id,
          target:   r.target_id,
          // No permanent label — with real fan-in, labels render at the
          // path midpoint regardless of whether either endpoint is in
          // view, which looks like a floating label attached to
          // nothing. Color (from the legend) carries the type instead;
          // the label still appears on hover, added below. relType is
          // kept in `data` (not `label`) so counting/filtering/layout
          // logic below still has something stable to read.
          type:     'smoothstep',
          animated: relType === 'CALLS',
          style:    { stroke: REL_COLOR[relType] || '#2e2e3e', strokeWidth: 1.5 },
          data:     { relType },
        };
      });

      const hierarchyEdges = mappedEdges.filter(e => (e.data as any)?.relType === 'CONTAINS');
      const mapped = layoutGraph(unpositioned, hierarchyEdges);

      setNodes(mapped);
      setEdges(mappedEdges);
      setBaseEdges(mappedEdges);
    }).finally(() => setLoading(false));
  }, [repoId]);

  useEffect(() => { load(); }, [load]);

  const filtered = nodes.filter(n =>
    activeFilters.some(f => f.toLowerCase() === (n.data.nodeType || '').toLowerCase()) &&
    (!search || n.data.label.toLowerCase().includes(search.toLowerCase()))
  );

  const visibleNodeIds = new Set(filtered.map(n => n.id));
  const visibleEdges = edges.filter(e =>
    activeRelFilters.includes((e.data as any)?.relType || '') &&
    visibleNodeIds.has(e.source) &&
    visibleNodeIds.has(e.target)
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

  const getDeps      = (id: string) => baseEdges.filter(e => e.source === id).map(e => nodes.find(n => n.id === e.target)?.data.label).filter(Boolean);
  const getDependents = (id: string) => baseEdges.filter(e => e.target === id).map(e => nodes.find(n => n.id === e.source)?.data.label).filter(Boolean);

  if (!loading && nodes.length === 0) {
    return (
      <RepoEmptyState icon={Package} title="No graph data yet"
        description="The repository graph hasn't been built yet. Try refreshing after the repository finishes processing."
        action={{ label: 'Refresh', onClick: load }} />
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* ── Left panel ── */}
      <div className="w-64 flex-shrink-0 border-r border-[#1e1e2e] flex flex-col bg-[#0d0d14]">
        {/* Search */}
        <div className="p-3 border-b border-[#1e1e2e]">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search nodes..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#12121a] border border-[#1e1e2e] rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/30" />
          </div>
        </div>

        {/* Filters */}
        <div className="p-3 border-b border-[#1e1e2e]">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Filter</div>
          {TYPE_CONFIG.map(({ key, label, icon: Icon, color }) => {
            const count  = nodes.filter(n => (n.data.nodeType || '').toLowerCase() === key).length;
            const active = activeFilters.some(f => f.toLowerCase() === key);
            return (
              <button key={key}
                onClick={() => setActiveFilters(prev =>
                  active
                    ? prev.filter(f => f.toLowerCase() !== key)
                    : [...prev, key, key.charAt(0).toUpperCase() + key.slice(1)]
                )}
                className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors',
                  active ? 'text-zinc-300' : 'text-zinc-600 hover:text-zinc-400')}>
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active ? color : '#2e2e3e' }} />
                <Icon size={11} style={{ color: active ? color : undefined }} /> {label}
                <span className="ml-auto text-zinc-700">{count}</span>
              </button>
            );
          })}
        </div>
        {/* Edge legend / filter */}
        <div className="p-3 border-b border-[#1e1e2e]">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Edges</div>
          {REL_CONFIG.map(({ key, label, color }) => {
            const count  = baseEdges.filter(e => (e.data as any)?.relType === key).length;
            const active = activeRelFilters.includes(key);
            return (
              <button key={key}
                onClick={() => setActiveRelFilters(prev =>
                  active ? prev.filter(f => f !== key) : [...prev, key]
                )}
                className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors',
                  active ? 'text-zinc-300' : 'text-zinc-600 hover:text-zinc-400')}>
                <div className="w-4 h-[2px] flex-shrink-0 rounded" style={{ background: active ? color : '#2e2e3e' }} />
                {label}
                <span className="ml-auto text-zinc-700">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Node list */}
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-[10px] text-zinc-600 uppercase tracking-wider px-2 mb-1">
            Nodes ({filtered.length})
          </div>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 bg-[#12121a] rounded mb-1 animate-pulse" />)
            : filtered.map(node => (
              <button key={node.id}
                onClick={() => { setSelectedNode(node); fitView({ nodes: [node], padding: 0.5 }); }}
                className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors mb-0.5',
                  selectedNode?.id === node.id ? 'bg-indigo-600/15 text-indigo-300' : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a25]')}>
                <div className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: TYPE_COLOR[node.data.nodeType] || '#6366f1' }} />
                <span className="truncate">{node.data.label}</span>
              </button>
            ))
          }
        </div>

        {/* Path trace */}
        <div className="p-3 border-t border-[#1e1e2e]">
          <button onClick={() => { setTraceMode(!traceMode); clearTrace(); }}
            className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
              traceMode
                ? 'bg-red-500/15 text-red-400 border border-red-500/20'
                : 'bg-[#1a1a25] text-zinc-400 hover:text-zinc-300 border border-[#2e2e3e]')}>
            <Route size={13} />
            {traceMode ? 'Path Trace ON' : 'Enable Path Tracing'}
          </button>
          {tracePath.length > 0 && (
            <div className="mt-1.5 text-[10px] text-zinc-500">
              {tracePath.length - 1} hops
              <button onClick={clearTrace} className="ml-1 text-red-400">clear</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Graph canvas ── */}
      <div className="flex-1 relative min-w-0" style={{ height: '100%' }}>
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
            {/* Fixed dimensions so React Flow renders correctly */}
            <div style={{ width: '100%', height: 'calc(100vh - 168px)' }}>
              <ReactFlow
                nodes={filtered}
                edges={visibleEdges.map(e => ({
                  ...e,
                  label: hoveredEdgeId === e.id ? (e.data as any)?.relType : undefined,
                  style: { ...e.style, strokeWidth: hoveredEdgeId === e.id ? 3 : 1.5 },
                }))}
                nodeTypes={nodeTypes}
                onNodesChange={(changes: NodeChange[]) => setNodes(n => applyNodeChanges(changes, n))}
                onEdgesChange={(changes: EdgeChange[]) => setEdges(e => applyEdgeChanges(changes, e))}
                onEdgeMouseEnter={(_, edge) => setHoveredEdgeId(edge.id)}
                onEdgeMouseLeave={() => setHoveredEdgeId(null)}
                onNodeClick={handleNodeClick}
                fitView
                fitViewOptions={{ padding: 0.15 }}
                minZoom={0.05}
                maxZoom={3}
                proOptions={{ hideAttribution: true }}
                style={{ width: '100%', height: '100%' }}
              >
                <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e1e2e" />
                <Controls
                  showInteractive={false}
                  position="bottom-left"
                  style={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: '8px', overflow: 'hidden' }}
                />
                <MiniMap nodeColor={n => TYPE_COLOR[n.data?.nodeType] || '#6366f1'}
                  maskColor="rgba(10,10,15,0.85)"
                  style={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: '8px' }} />
              </ReactFlow>
            </div>
            {/* Zoom readout */}
            <div className="absolute bottom-4 left-[168px] z-10 flex items-center gap-1 bg-[#0d0d14] border border-[#1e1e2e] rounded-lg px-1 py-1">
              <button onClick={() => zoomOut({ duration: 150 })}
                className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#1a1a25] rounded transition-colors text-sm">
                −
              </button>
              <button onClick={zoomTo100}
                className="px-2 h-7 flex items-center justify-center text-xs text-zinc-400 hover:text-white hover:bg-[#1a1a25] rounded transition-colors tabular-nums min-w-[44px]">
                {zoomPct}%
              </button>
              <button onClick={() => zoomIn({ duration: 150 })}
                className="w-7 h-7 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-[#1a1a25] rounded transition-colors text-sm">
                +
              </button>
              <div className="w-px h-4 bg-[#1e1e2e] mx-0.5" />
              <button onClick={() => fitView({ padding: 0.15, duration: 200 })}
                className="px-2 h-7 flex items-center justify-center text-[10px] text-zinc-400 hover:text-white hover:bg-[#1a1a25] rounded transition-colors">
                Fit
              </button>
            </div>
          </>
        )}
      </div>

      {/* ── Right detail drawer ── */}
      <AnimatePresence>
        {selectedNode && !traceMode && (
          <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
            className="flex-shrink-0 border-l border-[#1e1e2e] bg-[#0d0d14] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-[#1e1e2e] flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full"
                style={{ background: TYPE_COLOR[selectedNode.data.nodeType] || '#6366f1' }} />
              <span className="text-xs font-medium text-zinc-400 uppercase">{selectedNode.data.nodeType}</span>
              <button onClick={() => setSelectedNode(null)} className="ml-auto">
                <X size={14} className="text-zinc-600 hover:text-zinc-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div>
                <div className="text-base font-bold text-white mb-1">{selectedNode.data.label}</div>
                {selectedNode.data.path && (
                  <div className="text-xs text-zinc-500 font-mono bg-[#12121a] rounded px-2 py-1">{selectedNode.data.path}</div>
                )}
              </div>
              {selectedNode.data.lines && (
                <div className="text-xs text-zinc-500 flex items-center gap-1.5">
                  <Zap size={11} className="text-indigo-400" />{selectedNode.data.lines} lines
                </div>
              )}
              <div>
                <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">
                  Dependencies ({getDeps(selectedNode.id).length})
                </div>
                {getDeps(selectedNode.id).length === 0
                  ? <div className="text-xs text-zinc-700">None</div>
                  : getDeps(selectedNode.id).map((d, i) => (
                    <div key={i} className="text-xs text-zinc-400 py-1 border-b border-[#1e1e2e] last:border-0">{d}</div>
                  ))
                }
              </div>
              <div>
                <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">
                  Dependents ({getDependents(selectedNode.id).length})
                </div>
                {getDependents(selectedNode.id).length === 0
                  ? <div className="text-xs text-zinc-700">None</div>
                  : getDependents(selectedNode.id).map((d, i) => (
                    <div key={i} className="text-xs text-zinc-400 py-1 border-b border-[#1e1e2e] last:border-0">{d}</div>
                  ))
                }
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
