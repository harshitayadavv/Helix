'use client';
import { useCallback } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlowProvider,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { nodeTypes } from './NodeTypes';
import { GraphControls } from './GraphControls';

interface DependencyGraphProps {
  nodes: Node[];
  edges: Edge[];
  onNodesChange?: (nodes: Node[]) => void;
  onEdgesChange?: (edges: Edge[]) => void;
}

function GraphInner({ nodes, edges, onNodesChange, onEdgesChange }: DependencyGraphProps) {
  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      onNodesChange?.(applyNodeChanges(changes, nodes));
    },
    [nodes, onNodesChange]
  );

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      onEdgesChange?.(applyEdgeChanges(changes, edges));
    },
    [edges, onEdgesChange]
  );

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={handleNodesChange}
      onEdgesChange={handleEdgesChange}
      fitView
      fitViewOptions={{ padding: 0.15 }}
      minZoom={0.1}
      maxZoom={3}
      defaultEdgeOptions={{
        type: 'smoothstep',
        style: { stroke: '#2e2e3e', strokeWidth: 1.5 },
      }}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#1e1e2e" />
      <MiniMap
        nodeColor={(node) => node.data?.color || '#6366f1'}
        maskColor="rgba(10,10,15,0.8)"
        style={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: '8px' }}
      />
      <GraphControls />
    </ReactFlow>
  );
}

export function DependencyGraph(props: DependencyGraphProps) {
  return (
    <ReactFlowProvider>
      <GraphInner {...props} />
    </ReactFlowProvider>
  );
}