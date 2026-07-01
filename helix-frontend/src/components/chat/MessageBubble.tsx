'use client';
import { motion } from 'framer-motion';
import { Zap, User } from 'lucide-react';
import { ChatMessage } from '@/types';
import { cn } from '@/lib/utils';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={cn('flex gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}
    >
      <div className={cn(
        'w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
        isUser ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-[#1e1e2e] border border-[#2e2e3e]'
      )}>
        {isUser ? <User size={11} className="text-white" /> : <Zap size={11} className="text-indigo-400" />}
      </div>

      <div className={cn(
        'max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed',
        isUser
          ? 'bg-indigo-600/20 border border-indigo-500/20 text-indigo-100'
          : 'bg-[#12121a] border border-[#1e1e2e] text-zinc-300'
      )}>
        {message.content || (
          <span className="flex gap-1 items-center text-zinc-600">
            <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1 h-1 bg-zinc-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
        {message.isStreaming && message.content && (
          <span className="inline-block w-0.5 h-3.5 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
        )}
      </div>
    </motion.div>
  );
}