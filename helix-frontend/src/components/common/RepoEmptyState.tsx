'use client';
import { motion } from 'framer-motion';
import { LucideIcon } from 'lucide-react';

interface RepoEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
}

export function RepoEmptyState({ icon: Icon, title, description, action }: RepoEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-[#12121a] border border-[#1e1e2e] flex items-center justify-center">
          <Icon size={28} className="text-zinc-700" />
        </div>
        <div>
          <div className="text-sm font-semibold text-zinc-500 mb-1">{title}</div>
          <div className="text-xs text-zinc-700 max-w-xs leading-relaxed">{description}</div>
        </div>
        {action && (
          <button onClick={action.onClick}
            className="mt-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors">
            {action.label}
          </button>
        )}
      </motion.div>
    </div>
  );
}
