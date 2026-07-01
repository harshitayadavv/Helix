'use client';
import { useState, useCallback } from 'react';
import { Node, Edge } from 'reactflow';
import { GraphNode, GraphEdge } from '@/types';

const NODE_COLORS: Record<string, string> = {
  file: '#3b82f6',
  function: '#22c55e',
  class: '#a855f7',
  module: '#f97316',
};

export function useGraph() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  const loadGraph = useCallback((rawNodes: GraphNode[], rawEdges: GraphEdge[]) => {
    const cols = Math.ceil(Math.sqrt(rawNodes.length));
    const mapped: Node[] = rawNodes.map((n, i) => ({
      id: n.id,
      type: 'helixNode',
      position: { x: (i % cols) * 220, y: Math.floor(i / cols) * 140 },
      data: {
        label: n.name,
        nodeType: n.type,
        path: n.path,
        lines: n.lines,
        color: NODE_COLORS[n.type] || '#6366f1',
      },
    }));

    const mappedEdges: Edge[] = rawEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      animated: e.type === 'call',
      style: { stroke: '#1e1e2e', strokeWidth: 1.5 },
    }));

    setNodes(mapped);
    setEdges(mappedEdges);
  }, []);

  return { nodes, edges, setNodes, setEdges, loadGraph };
}