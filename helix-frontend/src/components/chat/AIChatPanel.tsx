'use client';
import { useRef, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Sparkles, X, ChevronDown } from 'lucide-react';
import { MessageBubble } from './MessageBubble';
import { Button } from '@/components/ui/button';
import { useChat } from '@/hooks/useChat';

const SUGGESTIONS = [
  'What are the main entry points?',
  'Find circular dependencies',
  'Which functions are most called?',
  'Explain the auth module',
];

interface AIChatPanelProps {
  repoId: string;
  onClose?: () => void;
}

export function AIChatPanel({ repoId, onClose }: AIChatPanelProps) {
  const { messages, loading, send } = useChat(repoId);
  const [input, setInput] = useState('');
  const [showScroll, setShowScroll] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setShowScroll(el.scrollHeight - el.scrollTop - el.clientHeight > 100);
  };

  const handleSend = () => {
    const msg = input.trim();
    if (!msg || loading) return;
    send(msg);
    setInput('');
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d14] border-l border-[#1e1e2e]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#1e1e2e] flex items-center gap-2 flex-shrink-0">
        <div className="w-6 h-6 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
          <Sparkles size={12} className="text-indigo-400" />
        </div>
        <div>
          <div className="text-sm font-medium text-white">Helix AI</div>
          <div className="text-[10px] text-green-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
            Ready
          </div>
        </div>
        {onClose && (
          <Button variant="ghost" size="icon" className="w-7 h-7 ml-auto" onClick={onClose}>
            <X size={13} />
          </Button>
        )}
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-3 space-y-3"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-3">
              <Sparkles size={18} className="text-indigo-400" />
            </div>
            <div className="text-sm font-medium text-zinc-400 mb-1">Ask about your codebase</div>
            <div className="text-xs text-zinc-600 mb-4">I understand the full dependency graph</div>
            <div className="flex flex-col gap-1.5 w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => { setInput(s); inputRef.current?.focus(); }}
                  className="text-left text-xs text-zinc-500 hover:text-zinc-300 bg-[#12121a] hover:bg-[#1a1a25] border border-[#1e1e2e] rounded-lg px-3 py-2 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {showScroll && (
          <motion.button
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            onClick={() => { scrollRef.current?.scrollTo({ top: 999999, behavior: 'smooth' }); }}
            className="absolute bottom-16 right-4 w-7 h-7 bg-[#1e1e2e] border border-[#2e2e3e] rounded-full flex items-center justify-center hover:bg-[#2e2e3e] transition-colors"
          >
            <ChevronDown size={13} className="text-zinc-400" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input */}
      <div className="px-3 py-3 border-t border-[#1e1e2e] flex-shrink-0">
        <div className="flex gap-2 bg-[#12121a] border border-[#1e1e2e] rounded-xl p-2 focus-within:border-indigo-500/40 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask anything about the code..."
            rows={1}
            className="flex-1 bg-transparent text-sm text-zinc-300 placeholder:text-zinc-600 resize-none focus:outline-none leading-relaxed max-h-32"
            style={{ scrollbarWidth: 'none' }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="w-7 h-7 flex-shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-colors self-end"
          >
            <Send size={12} className="text-white" />
          </button>
        </div>
        <div className="text-[10px] text-zinc-700 text-center mt-1.5">Enter to send · Shift+Enter for newline</div>
      </div>
    </div>
  );
}