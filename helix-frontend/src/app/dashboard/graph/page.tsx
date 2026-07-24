'use client';
import { useState, useCallback } from 'react';
import ReactFlow, {
  Background, BackgroundVariant, MiniMap, ReactFlowProvider,
  Node, Edge, NodeChange, EdgeChange, applyNodeChanges, applyEdgeChanges,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FileCode2, Code2, Box, Package, X, ChevronDown, GitBranch, Zap, Route } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { nodeTypes } from '@/components/graph/NodeTypes';
import { cn } from '@/lib/utils';

const DEMO_NODES: Node[] = [
  { id: '1', type: 'helixNode', position: { x: 0, y: 0 }, data: { label: 'app', nodeType: 'module', path: 'src/app.py', lines: 120, color: '#f97316' } },
  { id: '2', type: 'helixNode', position: { x: 220, y: 0 }, data: { label: 'auth.py', nodeType: 'file', path: 'src/auth.py', lines: 340, color: '#3b82f6' } },
  { id: '3', type: 'helixNode', position: { x: 440, y: 0 }, data: { label: 'models.py', nodeType: 'file', path: 'src/models.py', lines: 210, color: '#3b82f6' } },
  { id: '4', type: 'helixNode', position: { x: 660, y: 0 }, data: { label: 'UserService', nodeType: 'class', path: 'src/services.py', lines: 89, color: '#a855f7' } },
  { id: '5', type: 'helixNode', position: { x: 0, y: 140 }, data: { label: 'AuthHandler', nodeType: 'class', path: 'src/auth.py', lines: 45, color: '#a855f7' } },
  { id: '6', type: 'helixNode', position: { x: 220, y: 140 }, data: { label: 'parse_token', nodeType: 'function', path: 'src/utils.py', lines: 22, color: '#22c55e' } },
  { id: '7', type: 'helixNode', position: { x: 440, y: 140 }, data: { label: 'validate_user', nodeType: 'function', path: 'src/auth.py', lines: 18, color: '#22c55e' } },
  { id: '8', type: 'helixNode', position: { x: 660, y: 140 }, data: { label: 'config.py', nodeType: 'file', path: 'src/config.py', lines: 55, color: '#3b82f6' } },
  { id: '9', type: 'helixNode', position: { x: 0, y: 280 }, data: { label: 'database', nodeType: 'module', path: 'src/db/', lines: 400, color: '#f97316' } },
  { id: '10', type: 'helixNode', position: { x: 220, y: 280 }, data: { label: 'Repository', nodeType: 'class', path: 'src/db/repo.py', lines: 130, color: '#a855f7' } },
  { id: '11', type: 'helixNode', position: { x: 440, y: 280 }, data: { label: 'hash_password', nodeType: 'function', path: 'src/utils.py', lines: 12, color: '#22c55e' } },
  { id: '12', type: 'helixNode', position: { x: 660, y: 280 }, data: { label: 'middleware.py', nodeType: 'file', path: 'src/middleware.py', lines: 78, color: '#3b82f6' } },
];

const BASE_EDGES: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', type: 'smoothstep', style: { stroke: '#2e2e3e', strokeWidth: 1.5 } },
  { id: 'e1-3', source: '1', target: '3', type: 'smoothstep', style: { stroke: '#2e2e3e', strokeWidth: 1.5 } },
  { id: 'e1-9', source: '1', target: '9', type: 'smoothstep', style: { stroke: '#2e2e3e', strokeWidth: 1.5 } },
  { id: 'e2-5', source: '2', target: '5', type: 'smoothstep', style: { stroke: '#2e2e3e', strokeWidth: 1.5 } },
  { id: 'e2-6', source: '2', target: '6', type: 'smoothstep', style: { stroke: '#2e2e3e', strokeWidth: 1.5 } },
  { id: 'e3-4', source: '3', target: '4', type: 'smoothstep', style: { stroke: '#2e2e3e', strokeWidth: 1.5 } },
  { id: 'e4-10', source: '4', target: '10', type: 'smoothstep', style: { stroke: '#2e2e3e', strokeWidth: 1.5 } },
  { id: 'e5-7', source: '5', target: '7', type: 'smoothstep', style: { stroke: '#2e2e3e', strokeWidth: 1.5 } },
  { id: 'e5-11', source: '5', target: '11', type: 'smoothstep', style: { stroke: '#2e2e3e', strokeWidth: 1.5 } },
  { id: 'e1-8', source: '1', target: '8', type: 'smoothstep', style: { stroke: '#2e2e3e', strokeWidth: 1.5 } },
  { id: 'e9-10', source: '9', target: '10', type: 'smoothstep', style: { stroke: '#2e2e3e', strokeWidth: 1.5 } },
];

const NODE_TYPE_CONFIG = [
  { key: 'file', label: 'Files', icon: FileCode2, color: '#3b82f6' },
  { key: 'function', label: 'Functions', icon: Code2, color: '#22c55e' },
  { key: 'class', label: 'Classes', icon: Box, color: '#a855f7' },
  { key: 'module', label: 'Modules', icon: Package, color: '#f97316' },
];

const REPOS = ['helix-backend', 'react-dashboard', 'ml-pipeline'];

// BFS shortest path
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
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }
  return [];
}

function GraphInner() {
  const [nodes, setNodes] = useState<Node[]>(DEMO_NODES);
  const [edges, setEdges] = useState<Edge[]>(BASE_EDGES);
  const [search, setSearch] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>(['file', 'function', 'class', 'module']);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [repo, setRepo] = useState(REPOS[0]);
  const [showRepoMenu, setShowRepoMenu] = useState(false);
  const [traceMode, setTraceMode] = useState(false);
  const [tracePath, setTracePath] = useState<string[]>([]);
  const [traceNodes, setTraceNodes] = useState<string[]>([]);
  const { fitView } = useReactFlow();

  const filteredNodes = nodes.filter(n => {
    const matchesFilter = activeFilters.includes(n.data.nodeType);
    const matchesSearch = !search || n.data.label.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (traceMode) {
      setTraceNodes(prev => {
        if (prev.length === 0) return [node.id];
        if (prev.length === 1) {
          const path = findShortestPath(BASE_EDGES, prev[0], node.id);
          setTracePath(path);
          // Highlight edges
          setEdges(BASE_EDGES.map(e => {
            const inPath = path.includes(e.source) && path.includes(e.target);
            return { ...e, style: { stroke: inPath ? '#ef4444' : '#1e1e2e', strokeWidth: inPath ? 3 : 1.5 } };
          }));
          return [...prev, node.id];
        }
        setTracePath([]);
        setEdges(BASE_EDGES);
        return [node.id];
      });
    } else {
      setSelectedNode(node);
    }
  }, [traceMode]);

  const clearTrace = () => {
    setTraceNodes([]);
    setTracePath([]);
    setEdges(BASE_EDGES);
  };

  const getDependencies = (nodeId: string) =>
    BASE_EDGES.filter(e => e.source === nodeId).map(e => nodes.find(n => n.id === e.target)?.data.label).filter(Boolean);
  const getDependents = (nodeId: string) =>
    BASE_EDGES.filter(e => e.target === nodeId).map(e => nodes.find(n => n.id === e.source)?.data.label).filter(Boolean);

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />

        <div className="flex flex-1 min-h-0">
          {/* Left panel */}
          <div className="w-64 flex-shrink-0 border-r border-[#1e1e2e] flex flex-col bg-[#0d0d14]">
            {/* Repo selector */}
            <div className="p-3 border-b border-[#1e1e2e]">
              <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-1.5">Repository</div>
              <div className="relative">
                <button
                  onClick={() => setShowRepoMenu(!showRepoMenu)}
                  className="w-full flex items-center gap-2 bg-[#12121a] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-zinc-300 hover:border-indigo-500/30 transition-colors"
                >
                  <GitBranch size={13} className="text-indigo-400" />
                  <span className="flex-1 text-left truncate">{repo}</span>
                  <ChevronDown size={12} className="text-zinc-500" />
                </button>
                <AnimatePresence>
                  {showRepoMenu && (
                    <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                      className="absolute top-full mt-1 w-full bg-[#12121a] border border-[#1e1e2e] rounded-lg py-1 z-10 shadow-xl">
                      {REPOS.map(r => (
                        <button key={r} onClick={() => { setRepo(r); setShowRepoMenu(false); }}
                          className={cn('w-full text-left px-3 py-1.5 text-sm hover:bg-[#1a1a25] transition-colors',
                            r === repo ? 'text-indigo-300' : 'text-zinc-400')}>
                          {r}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Search */}
            <div className="p-3 border-b border-[#1e1e2e]">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-600" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search nodes..."
                  className="w-full pl-8 pr-3 py-1.5 bg-[#12121a] border border-[#1e1e2e] rounded-lg text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/30" />
              </div>
            </div>

            {/* Filters */}
            <div className="p-3 border-b border-[#1e1e2e]">
              <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Filter by type</div>
              <div className="space-y-1">
                {NODE_TYPE_CONFIG.map(({ key, label, icon: Icon, color }) => {
                  const active = activeFilters.includes(key);
                  return (
                    <button key={key} onClick={() => setActiveFilters(prev => active ? prev.filter(f => f !== key) : [...prev, key])}
                      className={cn('w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors',
                        active ? 'bg-[#1a1a25] text-zinc-300' : 'text-zinc-600 hover:text-zinc-400')}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active ? color : '#2e2e3e' }} />
                      <Icon size={11} style={{ color: active ? color : undefined }} />
                      {label}
                      <span className="ml-auto text-zinc-700">{nodes.filter(n => n.data.nodeType === key).length}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Node list */}
            <div className="flex-1 overflow-y-auto p-2">
              <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider px-2 mb-2">Nodes ({filteredNodes.length})</div>
              {filteredNodes.map(node => (
                <button key={node.id} onClick={() => { setSelectedNode(node); fitView({ nodes: [node], padding: 0.5 }); }}
                  className={cn('w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-left transition-colors mb-0.5',
                    selectedNode?.id === node.id ? 'bg-indigo-600/15 text-indigo-300' : 'text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a25]')}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: node.data.color }} />
                  <span className="truncate">{node.data.label}</span>
                </button>
              ))}
            </div>

            {/* Path trace toggle */}
            <div className="p-3 border-t border-[#1e1e2e]">
              <button onClick={() => { setTraceMode(!traceMode); clearTrace(); }}
                className={cn('w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                  traceMode ? 'bg-red-500/15 text-red-400 border border-red-500/20' : 'bg-[#1a1a25] text-zinc-400 hover:text-zinc-300 border border-[#2e2e3e]')}>
                <Route size={13} />
                {traceMode ? 'Path Trace ON — click 2 nodes' : 'Enable Path Tracing'}
              </button>
              {tracePath.length > 0 && (
                <div className="mt-2 text-[10px] text-zinc-500">
                  Path length: {tracePath.length - 1} hops
                  <button onClick={clearTrace} className="ml-2 text-red-400 hover:text-red-300">clear</button>
                </div>
              )}
            </div>
          </div>

          {/* Graph canvas */}
          <div className="flex-1 relative min-w-0">
            {traceMode && traceNodes.length < 2 && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 bg-red-500/15 border border-red-500/30 text-red-400 text-xs px-4 py-2 rounded-full">
                {traceNodes.length === 0 ? 'Click first node to start path' : 'Click second node to trace path'}
              </div>
            )}
            <ReactFlow
              nodes={filteredNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={(changes: NodeChange[]) => setNodes(n => applyNodeChanges(changes, n))}
              onEdgesChange={(changes: EdgeChange[]) => setEdges(e => applyEdgeChanges(changes, e))}
              onNodeClick={handleNodeClick}
              fitView fitViewOptions={{ padding: 0.15 }}
              minZoom={0.05} maxZoom={3}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e1e2e" />
              <MiniMap nodeColor={n => n.data?.color || '#6366f1'} maskColor="rgba(10,10,15,0.85)"
                style={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: '8px' }} />
            </ReactFlow>
          </div>

          {/* Right detail drawer */}
          <AnimatePresence>
            {selectedNode && !traceMode && (
              <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 280, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
                className="flex-shrink-0 border-l border-[#1e1e2e] bg-[#0d0d14] flex flex-col overflow-hidden">
                <div className="p-4 border-b border-[#1e1e2e] flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: selectedNode.data.color }} />
                  <span className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{selectedNode.data.nodeType}</span>
                  <button onClick={() => setSelectedNode(null)} className="ml-auto">
                    <X size={14} className="text-zinc-600 hover:text-zinc-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <div className="text-lg font-bold text-white mb-1">{selectedNode.data.label}</div>
                    {selectedNode.data.path && (
                      <div className="text-xs text-zinc-500 font-mono bg-[#12121a] rounded px-2 py-1">{selectedNode.data.path}</div>
                    )}
                  </div>
                  {selectedNode.data.lines && (
                    <div className="flex items-center gap-2 text-xs text-zinc-500">
                      <Zap size={11} className="text-indigo-400" />
                      <span>{selectedNode.data.lines} lines of code</span>
                    </div>
                  )}
                  <div>
                    <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Dependencies ({getDependencies(selectedNode.id).length})</div>
                    {getDependencies(selectedNode.id).length === 0
                      ? <div className="text-xs text-zinc-700">None</div>
                      : getDependencies(selectedNode.id).map((d, i) => (
                        <div key={i} className="text-xs text-zinc-400 py-1 border-b border-[#1e1e2e] last:border-0">{d}</div>
                      ))}
                  </div>
                  <div>
                    <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-2">Dependents ({getDependents(selectedNode.id).length})</div>
                    {getDependents(selectedNode.id).length === 0
                      ? <div className="text-xs text-zinc-700">None</div>
                      : getDependents(selectedNode.id).map((d, i) => (
                        <div key={i} className="text-xs text-zinc-400 py-1 border-b border-[#1e1e2e] last:border-0">{d}</div>
                      ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function GraphPage() {
  return <ReactFlowProvider><GraphInner /></ReactFlowProvider>;
}
