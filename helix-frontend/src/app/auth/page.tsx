'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Copy, Check, ArrowRight, BarChart2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { registerUser, getUsageStats } from '@/lib/api';

export default function AuthPage() {
  const [email, setEmail] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [existingKey, setExistingKey] = useState('');
  const [usage, setUsage] = useState<{ endpoint: string; count: number }[]>([]);
  const router = useRouter();

  useEffect(() => {
    try {
      const saved = localStorage.getItem('helix_api_key');
      if (saved) {
        setExistingKey(saved);
        getUsageStats()
          .then(r => setUsage(r.data?.endpoints || []))
          .catch(() => {});
      }
    } catch { /* ignore */ }
  }, []);

  const generate = async () => {
    if (!email.trim()) { setError('Email is required'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await registerUser('', email.trim(), '');
      const key = res.data?.api_key || res.data?.key || '';
      setApiKey(key);
      try { localStorage.setItem('helix_api_key', key); } catch { /* ignore */ }
    } catch {
      setError('Failed to generate API key. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copy = (key: string) => {
    navigator.clipboard.writeText(key).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const proceed = () => router.push('/dashboard');

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      {/* Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-indigo-600/6 blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-md"
      >
        {/* Card */}
        <div className="bg-[#0d0d14] border border-[#1e1e2e] rounded-2xl p-8 shadow-2xl">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-900/40">
              <Zap size={22} className="text-white" />
            </div>
            <h1 className="text-xl font-bold text-white">Get started with Helix</h1>
            <p className="text-sm text-zinc-500 mt-1.5 text-center">
              Generate your API key to access the platform
            </p>
          </div>

          <AnimatePresence mode="wait">
            {/* Existing key — show usage */}
            {existingKey && !apiKey ? (
              <motion.div key="existing" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="mb-5">
                  <div className="text-xs text-zinc-500 mb-1.5">Your API key</div>
                  <div className="flex items-center gap-2 bg-[#12121a] border border-[#1e1e2e] rounded-xl px-3 py-2.5">
                    <code className="flex-1 text-xs text-indigo-300 font-mono truncate">{existingKey}</code>
                    <button onClick={() => copy(existingKey)}>
                      {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} className="text-zinc-500 hover:text-zinc-300" />}
                    </button>
                  </div>
                </div>

                {usage.length > 0 && (
                  <div className="mb-5">
                    <div className="text-xs text-zinc-500 mb-2 flex items-center gap-1.5">
                      <BarChart2 size={11} /> Usage by endpoint
                    </div>
                    <div className="h-36 bg-[#12121a] border border-[#1e1e2e] rounded-xl p-3">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={usage} layout="vertical">
                          <XAxis type="number" tick={{ fill: '#52525b', fontSize: 10 }} axisLine={false} tickLine={false} />
                          <YAxis type="category" dataKey="endpoint" tick={{ fill: '#71717a', fontSize: 10 }} axisLine={false} tickLine={false} width={80} />
                          <Tooltip contentStyle={{ background: '#0d0d14', border: '1px solid #1e1e2e', borderRadius: 8, fontSize: 11 }} />
                          <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                <button onClick={proceed}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium text-white transition-colors">
                  Go to Dashboard <ArrowRight size={14} />
                </button>
              </motion.div>
            ) : !apiKey ? (
              /* Generate form */
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="mb-4">
                  <label className="text-xs text-zinc-500 mb-1.5 block">Email address</label>
                  <input
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && generate()}
                    type="email"
                    placeholder="you@company.com"
                    className="w-full px-4 py-2.5 bg-[#12121a] border border-[#1e1e2e] rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                  {error && <div className="text-xs text-red-400 mt-1.5">{error}</div>}
                </div>
                <button
                  onClick={generate}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-xl text-sm font-medium text-white transition-colors"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Generating...
                    </span>
                  ) : (
                    <>Generate API Key <ArrowRight size={14} /></>
                  )}
                </button>
              </motion.div>
            ) : (
              /* Success — show key */
              <motion.div key="success" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="flex items-center gap-2 text-green-400 text-sm font-medium mb-4">
                  <div className="w-4 h-4 bg-green-500/20 rounded-full flex items-center justify-center">
                    <Check size={10} />
                  </div>
                  API key generated successfully
                </div>
                <div className="mb-4">
                  <div className="text-xs text-zinc-500 mb-1.5">Your API key — save this, it won&apos;t be shown again</div>
                  <div className="flex items-center gap-2 bg-[#12121a] border border-indigo-500/30 rounded-xl px-3 py-3">
                    <code className="flex-1 text-xs text-indigo-300 font-mono break-all">{apiKey}</code>
                    <button onClick={() => copy(apiKey)} className="flex-shrink-0">
                      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} className="text-zinc-500 hover:text-zinc-300" />}
                    </button>
                  </div>
                </div>
                <button onClick={proceed}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-sm font-medium text-white transition-colors">
                  Continue to Dashboard <ArrowRight size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-center text-xs text-zinc-700 mt-4">
          By continuing you agree to the Helix Terms of Service
        </p>
      </motion.div>
    </div>
  );
}
