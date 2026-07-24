'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { Send, Sparkles, Plus, MessageSquare, Clock, ChevronRight } from 'lucide-react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { generateId } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Message { id: string; role: 'user' | 'assistant'; content: string; timestamp: string; }
interface Chat { id: string; title: string; messages: Message[]; timestamp: string; }

const SUGGESTIONS = [
  'Explain the authentication flow',
  'Find all API endpoints',
  'What does the payment service depend on?',
  'Show me all God Classes',
  'Generate a README for this project',
];

const SLASH_COMMANDS = [
  { cmd: '/explain', desc: 'Explain a file, function, or class' },
  { cmd: '/find', desc: 'Find all instances of a pattern' },
  { cmd: '/trace', desc: 'Trace the call path of a function' },
  { cmd: '/impact', desc: 'Analyze impact of changing a file' },
  { cmd: '/docs', desc: 'Generate documentation for a symbol' },
];

const MOCK_CHATS: Chat[] = [
  { id: '1', title: 'Auth flow analysis', messages: [], timestamp: '2 hours ago' },
  { id: '2', title: 'API endpoint mapping', messages: [], timestamp: 'Yesterday' },
  { id: '3', title: 'Dependency review', messages: [], timestamp: '3 days ago' },
];

const MOCK_RESPONSE = `## Authentication Flow

The authentication flow in this codebase follows a **JWT-based pattern**:

1. **Request arrives** at \`middleware.py\` which intercepts all protected routes
2. The \`AuthHandler\` class in \`auth.py\` calls \`parse_token()\` to decode the JWT
3. \`validate_user()\` checks the decoded payload against the database via \`UserService\`
4. If valid, the request proceeds; otherwise a \`401 Unauthorized\` is returned

### Key files involved:
- \`src/auth.py\` — Core auth logic (340 lines)
- \`src/middleware.py\` — Request interceptor (78 lines)  
- \`src/utils.py\` — Token parsing utilities

### Potential issues:
> ⚠️ No token refresh mechanism detected. JWTs may expire without graceful handling.`;

export default function ChatPage() {
  const [chats, setChats] = useState<Chat[]>(MOCK_CHATS);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCommands, setShowCommands] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleInput = (val: string) => {
    setInput(val);
    setShowCommands(val.startsWith('/') && val.length >= 1);
  };

  const newChat = () => {
    const chat: Chat = { id: generateId(), title: 'New chat', messages: [], timestamp: 'Just now' };
    setChats(prev => [chat, ...prev]);
    setActiveChat(chat);
    setMessages([]);
  };

  const send = useCallback(async (text?: string) => {
    const content = (text || input).trim();
    if (!content || loading) return;
    setInput('');
    setShowCommands(false);

    const userMsg: Message = { id: generateId(), role: 'user', content, timestamp: new Date().toISOString() };
    const assistantId = generateId();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', timestamp: new Date().toISOString() };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setLoading(true);

    // Simulate streaming
    const words = MOCK_RESPONSE.split(' ');
    let i = 0;
    const interval = setInterval(() => {
      if (i >= words.length) { clearInterval(interval); setLoading(false); return; }
      const chunk = words.slice(0, i + 1).join(' ');
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: chunk } : m));
      i++;
    }, 40);
  }, [input, loading]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const applyCommand = (cmd: string) => {
    setInput(cmd + ' ');
    setShowCommands(false);
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-screen overflow-hidden bg-[#0a0a0f]">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <div className="flex flex-1 min-h-0">

          {/* Chat history sidebar */}
          <div className="w-60 flex-shrink-0 border-r border-[#1e1e2e] flex flex-col bg-[#0d0d14]">
            <div className="p-3 border-b border-[#1e1e2e]">
              <button onClick={newChat}
                className="w-full flex items-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm text-white font-medium transition-colors">
                <Plus size={14} /> New chat
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider px-2 mb-2">Recent</div>
              {chats.map(chat => (
                <button key={chat.id} onClick={() => { setActiveChat(chat); setMessages(chat.messages); }}
                  className={cn('w-full text-left px-3 py-2.5 rounded-lg mb-0.5 transition-colors group',
                    activeChat?.id === chat.id ? 'bg-indigo-600/15 border border-indigo-500/20' : 'hover:bg-[#1a1a25]')}>
                  <div className={cn('text-sm truncate', activeChat?.id === chat.id ? 'text-indigo-300' : 'text-zinc-400')}>
                    {chat.title}
                  </div>
                  <div className="text-[10px] text-zinc-600 flex items-center gap-1 mt-0.5">
                    <Clock size={9} /> {chat.timestamp}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Main chat area */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-6">
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full max-w-xl mx-auto text-center">
                  <div className="w-14 h-14 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
                    <Sparkles size={24} className="text-indigo-400" />
                  </div>
                  <h2 className="text-xl font-bold text-white mb-2">Helix AI</h2>
                  <p className="text-sm text-zinc-500 mb-8">Ask anything about your codebase. I understand the full dependency graph.</p>
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
              )}

              <div className="max-w-3xl mx-auto space-y-6">
                <AnimatePresence>
                  {messages.map(msg => (
                    <motion.div key={msg.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                      className={cn('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}>
                      <div className={cn('w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1',
                        msg.role === 'user' ? 'bg-gradient-to-br from-indigo-500 to-purple-600' : 'bg-[#1e1e2e] border border-[#2e2e3e]')}>
                        {msg.role === 'user'
                          ? <span className="text-xs font-bold text-white">H</span>
                          : <Sparkles size={12} className="text-indigo-400" />}
                      </div>
                      <div className={cn('max-w-[80%] rounded-2xl px-4 py-3 text-sm',
                        msg.role === 'user'
                          ? 'bg-indigo-600/20 border border-indigo-500/20 text-indigo-100'
                          : 'bg-[#0d0d14] border border-[#1e1e2e] text-zinc-300')}>
                        {msg.role === 'assistant' ? (
                          <div className="prose prose-invert prose-sm max-w-none
                            prose-headings:text-white prose-headings:font-semibold
                            prose-p:text-zinc-300 prose-p:leading-relaxed
                            prose-code:text-indigo-300 prose-code:bg-indigo-500/10 prose-code:px-1 prose-code:rounded
                            prose-pre:bg-[#12121a] prose-pre:border prose-pre:border-[#1e1e2e]
                            prose-blockquote:border-l-indigo-500 prose-blockquote:text-zinc-400
                            prose-strong:text-white prose-li:text-zinc-300">
                            <ReactMarkdown>{msg.content || '...'}</ReactMarkdown>
                          </div>
                        ) : msg.content}
                        {loading && msg.role === 'assistant' && msg.content && (
                          <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            {/* Input area */}
            <div className="px-6 py-4 border-t border-[#1e1e2e]">
              <div className="max-w-3xl mx-auto relative">
                {/* Slash commands popup */}
                <AnimatePresence>
                  {showCommands && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
                      className="absolute bottom-full mb-2 left-0 w-full bg-[#0d0d14] border border-[#1e1e2e] rounded-xl overflow-hidden shadow-2xl z-10">
                      {SLASH_COMMANDS.filter(c => c.cmd.includes(input)).map(({ cmd, desc }) => (
                        <button key={cmd} onClick={() => applyCommand(cmd)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#1a1a25] transition-colors text-left">
                          <span className="text-sm font-mono text-indigo-400">{cmd}</span>
                          <span className="text-xs text-zinc-500">{desc}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-3 bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-3 focus-within:border-indigo-500/40 transition-colors">
                  <MessageSquare size={16} className="text-zinc-600 flex-shrink-0 mt-1" />
                  <textarea ref={inputRef} value={input} onChange={e => handleInput(e.target.value)} onKeyDown={handleKey}
                    placeholder="Ask anything... or type / for commands"
                    rows={1} className="flex-1 bg-transparent text-sm text-zinc-300 placeholder:text-zinc-600 resize-none focus:outline-none leading-relaxed max-h-40"
                    style={{ scrollbarWidth: 'none' }} />
                  <button onClick={() => send()} disabled={!input.trim() || loading}
                    className="w-8 h-8 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 rounded-xl flex items-center justify-center flex-shrink-0 self-end transition-colors">
                    <Send size={13} className="text-white" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <div className="flex gap-3 text-[10px] text-zinc-700">
                    {['/explain', '/find', '/trace'].map(c => (
                      <button key={c} onClick={() => applyCommand(c)} className="hover:text-zinc-500 transition-colors font-mono">{c}</button>
                    ))}
                  </div>
                  <span className="text-[10px] text-zinc-700">↵ send · ⇧↵ newline</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
