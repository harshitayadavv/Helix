'use client';
import { motion } from 'framer-motion';
import { FileCode2, Code2, Box, GitMerge } from 'lucide-react';
import { RepoStats } from '@/types';
import { formatNumber } from '@/lib/utils';

const STATS = [
  { key: 'filesCount' as keyof RepoStats, label: 'Files parsed', icon: FileCode2, color: '#3b82f6', bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.15)' },
  { key: 'functionsCount' as keyof RepoStats, label: 'Functions found', icon: Code2, color: '#22c55e', bg: 'rgba(34,197,94,0.08)', border: 'rgba(34,197,94,0.15)' },
  { key: 'classesCount' as keyof RepoStats, label: 'Classes found', icon: Box, color: '#a855f7', bg: 'rgba(168,85,247,0.08)', border: 'rgba(168,85,247,0.15)' },
  { key: 'dependenciesCount' as keyof RepoStats, label: 'Dependencies mapped', icon: GitMerge, color: '#f97316', bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.15)' },
];

export function StatsCards({ stats }: { stats: RepoStats }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {STATS.map(({ key, label, icon: Icon, color, bg, border }, i) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.06 }}
          style={{ background: bg, border: `1px solid ${border}` }}
          className="rounded-xl p-4"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: `${color}20`, border: `1px solid ${color}30` }}>
              <Icon size={14} style={{ color }} />
            </div>
          </div>
          <div className="text-2xl font-bold text-white mb-0.5">
            {formatNumber(stats[key] as number)}
          </div>
          <div className="text-xs text-zinc-500">{label}</div>
        </motion.div>
      ))}
    </div>
  );
}