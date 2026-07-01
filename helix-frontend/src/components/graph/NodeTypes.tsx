'use client';
import { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';
import { FileCode2, Code2, Box, Package } from 'lucide-react';

const NODE_CONFIG = {
  file: { icon: FileCode2, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)' },
  function: { icon: Code2, color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.25)' },
  class: { icon: Box, color: '#a855f7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.25)' },
  module: { icon: Package, color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.25)' },
};

interface NodeData {
  label: string;
  nodeType: 'file' | 'function' | 'class' | 'module';
  path?: string;
  lines?: number;
  color?: string;
}

export const HelixNode = memo(({ data, selected }: NodeProps<NodeData>) => {
  const cfg = NODE_CONFIG[data.nodeType] || NODE_CONFIG.file;
  const Icon = cfg.icon;

  return (
    <div
      style={{
        background: cfg.bg,
        border: `1px solid ${selected ? cfg.color : cfg.border}`,
        boxShadow: selected ? `0 0 0 2px ${cfg.color}30, 0 4px 20px ${cfg.color}20` : '0 2px 8px rgba(0,0,0,0.4)',
      }}
      className="rounded-xl px-3 py-2 min-w-[140px] max-w-[200px] transition-all cursor-pointer"
    >
      <Handle type="target" position={Position.Top} style={{ background: cfg.color, border: 'none', width: 6, height: 6 }} />

      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={12} style={{ color: cfg.color }} />
        <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: cfg.color }}>
          {data.nodeType}
        </span>
      </div>
      <div className="text-[12px] font-semibold text-white leading-tight truncate">
        {data.label}
      </div>
      {data.path && (
        <div className="text-[10px] text-zinc-500 truncate mt-0.5">{data.path}</div>
      )}
      {data.lines && (
        <div className="text-[10px] text-zinc-600 mt-0.5">{data.lines} lines</div>
      )}

      <Handle type="source" position={Position.Bottom} style={{ background: cfg.color, border: 'none', width: 6, height: 6 }} />
    </div>
  );
});

HelixNode.displayName = 'HelixNode';

export const nodeTypes = { helixNode: HelixNode };