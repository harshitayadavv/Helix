'use client';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Zap, GitBranch, MessageSquare, BarChart3, ArrowRight, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FEATURES = [
  { icon: GitBranch, title: 'Dependency graphs', desc: 'Visual maps of every import, call, and inheritance chain across your codebase.' },
  { icon: MessageSquare, title: 'AI-native chat', desc: 'Ask questions about any function, file, or module. Get answers grounded in your actual code.' },
  { icon: BarChart3, title: 'Code intelligence', desc: 'Auto-detected patterns, hotspots, dead code, and circular dependencies at a glance.' },
  { icon: Terminal, title: 'Multi-language', desc: 'Python, TypeScript, Go, Rust, and more — parsed with language-aware AST analysis.' },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Nav */}
      <nav className="px-8 py-4 flex items-center border-b border-[#1e1e2e]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <span className="font-semibold text-white tracking-tight">Helix</span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Link href="/auth/login">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/auth/signup">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        {/* Glow */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-indigo-600/8 blur-[120px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative max-w-3xl"
        >
          <div className="inline-flex items-center gap-2 text-xs text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 rounded-full px-3 py-1.5 mb-6">
            <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
            Now in beta — free for early access
          </div>

          <h1 className="text-5xl font-bold text-white leading-tight tracking-tight mb-5">
            Understand any codebase
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              in minutes, not months
            </span>
          </h1>

          <p className="text-lg text-zinc-500 leading-relaxed mb-8 max-w-xl mx-auto">
            Upload a repository. Helix builds a live dependency graph, then lets you have a real conversation with your code.
          </p>

          <div className="flex items-center gap-3 justify-center">
            <Link href="/auth/signup">
              <Button size="lg" className="gap-2">
                Try Helix free <ArrowRight size={15} />
              </Button>
            </Link>
            <Link href="/repo/demo">
              <Button variant="secondary" size="lg">View demo repo</Button>
            </Link>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="relative mt-20 grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl w-full"
        >
          {FEATURES.map(({ icon: Icon, title, desc }, i) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 + i * 0.07 }}
              className="text-left bg-[#0d0d14] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#2e2e3e] transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-3">
                <Icon size={15} className="text-indigo-400" />
              </div>
              <div className="text-sm font-semibold text-white mb-1">{title}</div>
              <div className="text-xs text-zinc-500 leading-relaxed">{desc}</div>
            </motion.div>
          ))}
        </motion.div>
      </main>
    </div>
  );
}
