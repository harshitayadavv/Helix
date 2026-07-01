'use client';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, CheckCircle2, Loader2 } from 'lucide-react';
import { ProcessingUpdate } from '@/types';
import { cn } from '@/lib/utils';

const STAGES = [
  { key: 'parsing', label: 'Parsing source files' },
  { key: 'analyzing', label: 'Analyzing structure' },
  { key: 'graphing', label: 'Building dependency graph' },
  { key: 'indexing', label: 'Indexing for AI search' },
  { key: 'complete', label: 'Complete' },
];

interface ProcessingProgressProps {
  update: ProcessingUpdate | null;
  connected: boolean;
}

export function ProcessingProgress({ update, connected }: ProcessingProgressProps) {
  const currentIdx = update ? STAGES.findIndex((s) => s.key === update.stage) : -1;

  return (
    <div className="rounded-xl border border-[#1e1e2e] bg-[#0d0d14] p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-7 h-7 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center">
          <Cpu size={13} className="text-indigo-400" />
        </div>
        <div className="text-sm font-medium text-zinc-300">Processing pipeline</div>
        <div className={cn(
          'ml-auto text-[10px] px-2 py-0.5 rounded-full border',
          connected ? 'text-green-400 border-green-500/30 bg-green-500/10' : 'text-zinc-500 border-zinc-700 bg-zinc-800/30'
        )}>
          {connected ? 'Live' : 'Offline'}
        </div>
      </div>

      {update && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-zinc-500 mb-1.5">
            <span>{update.message}</span>
            <span>{update.progress}%</span>
          </div>
          <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: `${update.progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        {STAGES.map(({ key, label }, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={key} className="flex items-center gap-2.5">
              <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                {done ? <CheckCircle2 size={14} className="text-green-400" />
                  : active ? <Loader2 size={14} className="text-indigo-400 animate-spin" />
                  : <div className="w-2 h-2 rounded-full bg-[#2e2e3e]" />}
              </div>
              <span className={cn('text-xs', done ? 'text-green-400' : active ? 'text-white' : 'text-zinc-600')}>
                {label}
              </span>
              {active && update?.current !== undefined && (
                <span className="ml-auto text-[10px] text-zinc-600">{update.current}/{update.total}</span>
              )}
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {!update && !connected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="mt-3 text-xs text-zinc-600 text-center">
            Waiting for repository upload...
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}