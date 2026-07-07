'use client';
import { useState, useEffect, useCallback } from 'react';
import { Node } from 'reactflow';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Loader2, Network } from 'lucide-react';
import { DependencyGraph } from '@/components/graph/DependencyGraph';
import { AIChatPanel } from '@/components/chat/AIChatPanel';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { Badge } from '@/components/ui/badge';
import { useGraph } from '@/hooks/useGraph';
import { getRepo, getGraph } from '@/lib/api';
import { useRepo } from '@/context/RepoContext';
import { RepoStats } from '@/types';

interface ApiNode {
  id: string;
  type: 'file' | 'function' | 'class' | 'module';
  name: string;
  file_path?: string;
  line_count?: number;
}

interface ApiEdge {
  source_id: string;
  target_id: string;
  relationship: string;
}

const EMPTY_STATS: RepoStats = {
  filesCount: 0,
  functionsCount: 0,
  classesCount: 0,
  dependenciesCount: 0,
  linesOfCode: 0,
};

export default function RepoPage({ params }: { params: { id: string } }) {
  const [chatOpen, setChatOpen] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [stats, setStats] = useState<RepoStats>(EMPTY_STATS);
  const [graphLoading, setGraphLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [hasNodes, setHasNodes] = useState(false);
  const { nodes, edges, setNodes, setEdges, loadGraph } = useGraph();
  const { setSelectedRepo } = useRepo();

  const loadData = useCallback(async () => {
    const id = params.id;

    // Load repo stats
    setStatsLoading(true);
    getRepo(id)
      .then(r => {
        const d = r.data;
        setStats({
          filesCount: d.file_count || 0,
          functionsCount: d.function_count || 0,
          classesCount: d.class_count || 0,
          dependenciesCount: d.dependency_count || d.edge_count || 0,
          linesOfCode: d.line_count || 0,
        });
        // Also keep localStorage up to date
        if (d.name) {
          setSelectedRepo(id, d.name);
        }
      })
      .catch(() => {})
      .finally(() => setStatsLoading(false));

    // Load graph
    setGraphLoading(true);
    getGraph(id)
      .then(r => {
        const apiNodes: ApiNode[] = r.data?.nodes || [];
        const apiEdges: ApiEdge[] = r.data?.edges || r.data?.relationships || [];
        setHasNodes(apiNodes.length > 0);
        if (apiNodes.length > 0) {
          loadGraph(
            apiNodes.map(n => ({
              id: n.id,
              type: n.type,
              name: n.name,
              path: n.file_path,
              lines: n.line_count,
            })),
            apiEdges.map((e, i) => ({
              id: `e${i}`,
              source: e.source_id,
              target: e.target_id,
              type: e.relationship as 'import' | 'call' | 'inherit' | 'use',
            }))
          );
        }
      })
      .catch(() => setHasNodes(false))
      .finally(() => setGraphLoading(false));
  }, [params.id, loadGraph, setSelectedRepo]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <>
      {/* Stats strip */}
      <div className="px-4 pt-4 pb-3 border-b border-[#1e1e2e] flex-shrink-0">
        {statsLoading ? (
          <div className="grid grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <StatsCards stats={stats} />
        )}
      </div>

      {/* Main split view */}
      <div className="flex flex-1 min-h-0">
        {/* Graph area */}
        <div className="flex-1 relative min-w-0">
          {graphLoading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <Loader2 size={28} className="text-indigo-400 animate-spin" />
              <div className="text-sm text-zinc-500">Building dependency graph...</div>
            </div>
          ) : !hasNodes ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
              <div className="w-14 h-14 rounded-2xl bg-[#12121a] border border-[#1e1e2e] flex items-center justify-center">
                <Network size={24} className="text-zinc-700" />
              </div>
              <div className="text-sm font-medium text-zinc-500">Graph is being built...</div>
              <div className="text-xs text-zinc-700 max-w-xs">
                The repository is still being parsed. This usually takes a few seconds.
              </div>
              <button onClick={loadData}
                className="text-xs text-indigo-400 hover:text-indigo-300 underline transition-colors mt-1">
                Refresh
              </button>
            </div>
          ) : (
            <DependencyGraph
              nodes={nodes}
              edges={edges}
              onNodesChange={setNodes}
              onEdgesChange={setEdges}
            />
          )}

          {/* Node detail overlay */}
          <AnimatePresence>
            {selectedNode && (
              <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }}
                className="absolute top-4 left-4 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-4 w-56 shadow-2xl z-10">
                <div className="flex items-start justify-between mb-3">
                  <Badge variant={selectedNode.data?.nodeType as 'file' | 'function' | 'class' | 'module'}>
                    {selectedNode.data?.nodeType}
                  </Badge>
                  <button onClick={() => setSelectedNode(null)}>
                    <X size={13} className="text-zinc-600 hover:text-zinc-400" />
                  </button>
                </div>
                <div className="text-sm font-semibold text-white mb-1">{selectedNode.data?.label}</div>
                {selectedNode.data?.path && (
                  <div className="text-[11px] text-zinc-500 font-mono mb-2">{selectedNode.data.path}</div>
                )}
                {selectedNode.data?.lines && (
                  <div className="text-xs text-zinc-600">{selectedNode.data.lines} lines</div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Chat toggle */}
          {!chatOpen && (
            <button onClick={() => setChatOpen(true)}
              className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg transition-colors">
              <MessageSquare size={13} /> Ask Helix AI
            </button>
          )}
        </div>

        {/* Chat panel */}
        <AnimatePresence>
          {chatOpen && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 340, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              className="w-[340px] flex-shrink-0 flex flex-col border-l border-[#1e1e2e]">
              <AIChatPanel repoId={params.id} onClose={() => setChatOpen(false)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
