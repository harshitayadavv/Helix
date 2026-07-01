'use client';
import { useState, useEffect } from 'react';
import { Node } from 'reactflow';
import { motion } from 'framer-motion';
import { MessageSquare, X } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { DependencyGraph } from '@/components/graph/DependencyGraph';
import { AIChatPanel } from '@/components/chat/AIChatPanel';
import { StatsCards } from '@/components/dashboard/StatsCards';
import { Badge } from '@/components/ui/badge';
import { useGraph } from '@/hooks/useGraph';
import { RepoStats } from '@/types';

const DEMO_NODES = [
  { id: '1', type: 'module' as const, name: 'app', path: 'src/app.py', lines: 120 },
  { id: '2', type: 'file' as const, name: 'auth.py', path: 'src/auth.py', lines: 340 },
  { id: '3', type: 'file' as const, name: 'models.py', path: 'src/models.py', lines: 210 },
  { id: '4', type: 'class' as const, name: 'UserService', path: 'src/services.py', lines: 89 },
  { id: '5', type: 'class' as const, name: 'AuthHandler', path: 'src/auth.py', lines: 45 },
  { id: '6', type: 'function' as const, name: 'parse_token', path: 'src/utils.py', lines: 22 },
  { id: '7', type: 'function' as const, name: 'validate_user', path: 'src/auth.py', lines: 18 },
  { id: '8', type: 'file' as const, name: 'config.py', path: 'src/config.py', lines: 55 },
  { id: '9', type: 'module' as const, name: 'database', path: 'src/db/', lines: 400 },
  { id: '10', type: 'class' as const, name: 'Repository', path: 'src/db/repo.py', lines: 130 },
  { id: '11', type: 'function' as const, name: 'hash_password', path: 'src/utils.py', lines: 12 },
  { id: '12', type: 'file' as const, name: 'middleware.py', path: 'src/middleware.py', lines: 78 },
];

const DEMO_EDGES = [
  { id: 'e1-2', source: '1', target: '2', type: 'import' as const },
  { id: 'e1-3', source: '1', target: '3', type: 'import' as const },
  { id: 'e1-9', source: '1', target: '9', type: 'import' as const },
  { id: 'e2-5', source: '2', target: '5', type: 'inherit' as const },
  { id: 'e2-6', source: '2', target: '6', type: 'call' as const },
  { id: 'e3-4', source: '3', target: '4', type: 'use' as const },
  { id: 'e4-10', source: '4', target: '10', type: 'use' as const },
  { id: 'e5-7', source: '5', target: '7', type: 'call' as const },
  { id: 'e5-11', source: '5', target: '11', type: 'call' as const },
  { id: 'e1-8', source: '1', target: '8', type: 'import' as const },
  { id: 'e1-12', source: '1', target: '12', type: 'import' as const },
  { id: 'e9-10', source: '9', target: '10', type: 'use' as const },
];

const DEMO_STATS: RepoStats = {
  filesCount: 12,
  functionsCount: 47,
  classesCount: 8,
  dependenciesCount: 89,
  linesOfCode: 3240,
};

export default function RepoPage({ params }: { params: { id: string } }) {
  const [chatOpen, setChatOpen] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const { nodes, edges, setNodes, setEdges, loadGraph } = useGraph();

  useEffect(() => {
    loadGraph(DEMO_NODES, DEMO_EDGES);
  }, [loadGraph]);

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar breadcrumbs={[
          { label: 'Repositories', href: '/dashboard' },
          { label: params.id === 'demo' ? 'helix-backend (demo)' : params.id },
        ]} />

        <div className="px-4 pt-4 pb-3 border-b border-[#1e1e2e] flex-shrink-0">
          <StatsCards stats={DEMO_STATS} />
        </div>

        <div className="flex flex-1 min-h-0">
          <div className="flex-1 relative min-w-0">
            <DependencyGraph nodes={nodes} edges={edges} onNodesChange={setNodes} onEdgesChange={setEdges} />

            {selectedNode && (
              <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
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

            {!chatOpen && (
              <button onClick={() => setChatOpen(true)}
                className="absolute top-4 right-4 z-10 flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium px-3 py-2 rounded-lg shadow-lg shadow-indigo-900/30 transition-colors">
                <MessageSquare size={13} />
                Ask Helix AI
              </button>
            )}
          </div>

          {chatOpen && (
            <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 340, opacity: 1 }} exit={{ width: 0, opacity: 0 }}
              className="w-[340px] flex-shrink-0 flex flex-col border-l border-[#1e1e2e]">
              <AIChatPanel repoId={params.id} onClose={() => setChatOpen(false)} />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}