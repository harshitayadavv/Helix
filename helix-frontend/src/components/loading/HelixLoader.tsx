'use client';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface HelixLoaderProps {
  label?: string;
  sublabel?: string;
  icon?: LucideIcon;
}

export function HelixLoader({ label = 'Loading', sublabel, icon: Icon }: HelixLoaderProps) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0f]">
      <div className="flex flex-col items-center gap-6">
        <motion.div
          animate={{ scale: [1, 1.08, 1], rotate: [0, 5, -5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
          className="relative w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/40"
        >
          {Icon ? <Icon size={26} className="text-white" /> : <Zap size={26} className="text-white" />}
          <motion.div
            className="absolute inset-0 rounded-2xl border-2 border-indigo-400"
            animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
          />
        </motion.div>

        <div className="relative w-10 h-10">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-indigo-400"
              style={{ top: '50%', left: '50%' }}
              animate={{
                x: [0, Math.cos((i * 2 * Math.PI) / 3) * 18, 0],
                y: [0, Math.sin((i * 2 * Math.PI) / 3) * 18, 0],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2, ease: 'easeInOut' }}
            />
          ))}
        </div>

        <div className="flex flex-col items-center gap-1.5">
          <span className="text-sm font-medium text-zinc-300">{label}</span>
          {sublabel && <span className="text-xs text-zinc-600">{sublabel}</span>}
        </div>

        <div className="w-48 h-1 bg-[#1e1e2e] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full"
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            style={{ width: '40%' }}
          />
        </div>
      </div>
    </div>
  );
}