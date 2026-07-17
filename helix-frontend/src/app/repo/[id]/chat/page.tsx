'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Send, Sparkles, ChevronRight } from 'lucide-react';
import { sendChatMessage } from '@/lib/api';
import { generateId } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const SUGGESTIONS = [
  'Explain the authentication flow',
  'Find all API endpoints',
  'What does the main module depend on?',
  'Show me all God Classes',
  'Generate a README for this project',
];

const SLASH_COMMANDS = [
  { cmd: '/explain', desc: 'Explain a file, function, or class' },
  { cmd: '/find',    desc: 'Find all instances of a pattern' },
  { cmd: '/trace',   desc: 'Trace the call path of a function' },
  { cmd: '/impact',  desc: 'Analyze impact of changing a file' },
  { cmd: '/docs',    desc: 'Generate documentation for a symbol' },
];

export default function ChatPage({ params }: { params: { id: string } }) {
  const [messages,      setMessages]      = useState<Message[]>([]);
  const [input,         setInput]         = useState('');
  const [loading,       setLoading]       = useState(false);
  const [showCommands,  setShowCommands]  = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const send = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput('');
    setShowCommands(false);

    const userMsg: Message = {
      id: generateId(), role: 'user', content, timestamp: new Date().toISOString(),
    };
    const assistantId = generateId();
    const assistantMsg: Message = {
      id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setLoading(true);

    try {
      await sendChatMessage(params.id, content, chunk => {
        setMessages(prev =>
          prev.map(m => m.id === assistantId ? { ...m, content: m.content + chunk } : m)
        );
      });
    } catch {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantId
            ? { ...m, content: 'Failed to get a response. Please try again.' }
            : m
        )
      );
    } finally {
      setLoading(false);
    }
  }, [input, loading, params.id]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const handleInput = (val: string) => {
    setInput(val);
    setShowCommands(val.startsWith('/') && val.length >= 1);
  };

  return (
    // Full-width, no history sidebar
    <div className="flex flex-1 min-h-0 flex-col">

      {/* ── Messages ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
        {messages.length === 0 ? (
          /* Empty state with suggestions */
          <div className="flex flex-col items-center justify-center h-full max-w-xl mx-auto text-center">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
              <Sparkles size={24} className="text-indigo-400" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Helix AI</h2>
            <p className="text-sm text-zinc-500 mb-8">
              Ask anything about your codebase. I understand the full dependency graph.
            </p>
            <div className="grid grid-cols-1 gap-2 w-full">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-left text-sm text-zinc-400 hover:text-zinc-200 bg-[#0d0d14] hover:bg-[#12121a] border border-[#1e1e2e] hover:border-[#2e2e3e] rounded-xl px-4 py-3 transition-all flex items-center gap-3">
                  <ChevronRight size={14} className="text-indigo-500 flex-shrink-0" />
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            <AnimatePresence>
              {messages.map(msg => (
                <motion.div key={msg.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>

                  {/* Avatar */}
                  <div className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1',
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-indigo-500 to-purple-600'
                      : 'bg-[#1e1e2e] border border-[#2e2e3e]'
                  )}>
                    {msg.role === 'user'
                      ? <span className="text-xs font-bold text-white">H</span>
                      : <Sparkles size={12} className="text-indigo-400" />
                    }
                  </div>

                  {/* Bubble */}
                  <div className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-3 text-sm',
                    msg.role === 'user'
                      ? 'bg-indigo-600/20 border border-indigo-500/20 text-indigo-100'
                      : 'bg-[#0d0d14] border border-[#1e1e2e] text-zinc-300'
                  )}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-invert prose-sm max-w-none
                        prose-headings:text-white prose-p:text-zinc-300
                        prose-code:text-indigo-300 prose-code:bg-indigo-500/10
                        prose-code:px-1 prose-code:rounded
                        prose-pre:bg-[#12121a] prose-pre:border prose-pre:border-[#1e1e2e]
                        prose-strong:text-white prose-li:text-zinc-300">
                        <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                      </div>
                    ) : (
                      msg.content
                    )}
                    {loading && msg.role === 'assistant' && msg.content && (
                      <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* ── Input area ── */}
      <div className="px-6 py-4 border-t border-[#1e1e2e] flex-shrink-0">
        <div className="max-w-3xl mx-auto relative">

          {/* Slash commands popup */}
          <AnimatePresence>
            {showCommands && (
              <motion.div
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                className="absolute bottom-full mb-2 left-0 w-full bg-[#0d0d14] border border-[#1e1e2e] rounded-xl overflow-hidden shadow-2xl z-10">
                {SLASH_COMMANDS.filter(c => c.cmd.includes(input)).map(({ cmd, desc }) => (
                  <button key={cmd}
                    onClick={() => { setInput(cmd + ' '); setShowCommands(false); inputRef.current?.focus(); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#1a1a25] transition-colors text-left">
                    <span className="text-sm font-mono text-indigo-400">{cmd}</span>
                    <span className="text-xs text-zinc-500">{desc}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input box */}
          <div className="flex gap-3 bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-3 focus-within:border-indigo-500/40 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => handleInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything... or type / for commands"
              rows={1}
              className="flex-1 bg-transparent text-sm text-zinc-300 placeholder:text-zinc-600 resize-none focus:outline-none leading-relaxed max-h-40"
              style={{ scrollbarWidth: 'none' }}
            />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              className="w-8 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 rounded-xl flex items-center justify-center flex-shrink-0 self-end transition-colors">
              <Send size={13} className="text-white" />
            </button>
          </div>

          {/* Hints */}
          <div className="flex items-center justify-between mt-2 px-1">
            <div className="flex gap-3 text-[10px] text-zinc-700">
              {['/explain', '/find', '/trace'].map(c => (
                <button key={c} onClick={() => { setInput(c + ' '); inputRef.current?.focus(); }}
                  className="hover:text-zinc-500 font-mono transition-colors">{c}</button>
              ))}
            </div>
            <span className="text-[10px] text-zinc-700">↵ send · ⇧↵ newline</span>
          </div>
        </div>
      </div>
    </div>
  );
}
