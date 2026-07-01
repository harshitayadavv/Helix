'use client';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface EmptyStateProps {
  title?: string;
  description: string;
}

export function EmptyState({ title = 'No repository loaded', description }: EmptyStateProps) {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-4">
        <div className="w-20 h-20 rounded-3xl bg-[#12121a] border border-[#1e1e2e] flex items-center justify-center">
          <Zap size={36} className="text-zinc-800" />
        </div>
        <div>
          <div className="text-base font-semibold text-zinc-500 mb-1">{title}</div>
          <div className="text-sm text-zinc-700 max-w-xs leading-relaxed">{description}</div>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="mt-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors"
        >
          Upload Repository
        </button>
      </motion.div>
    </div>
  );
}
