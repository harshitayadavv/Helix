'use client';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Upload, Network, MessageSquare, X, ArrowRight, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';

const STEPS = [
  {
    icon: Zap,
    title: 'Welcome to Helix',
    desc: 'Helix is an AI-powered code intelligence platform. Upload any repository and instantly get a visual dependency graph, intelligent search, and an AI assistant that understands your entire codebase.',
    cta: 'Get started',
    color: '#6366f1',
  },
  {
    icon: Upload,
    title: 'Upload your first repository',
    desc: 'Head to the Dashboard and click "New repository". Upload a ZIP archive of any codebase — Helix will parse every file, function, and class automatically.',
    cta: 'Go to Dashboard',
    href: '/dashboard',
    color: '#3b82f6',
  },
  {
    icon: Network,
    title: 'Explore the graph',
    desc: 'Graph Explorer shows every dependency in your codebase as an interactive visual map. Click nodes to inspect them, filter by type, and trace paths between any two files.',
    cta: 'Open Graph Explorer',
    href: '/dashboard/graph',
    color: '#a855f7',
  },
  {
    icon: MessageSquare,
    title: 'Ask AI anything',
    desc: 'The AI Chat page lets you have a real conversation with your codebase. Ask about authentication flows, find all API endpoints, or generate a full README — it understands the whole graph.',
    cta: 'Open AI Chat',
    href: '/dashboard/chat',
    color: '#22c55e',
  },
];

const STORAGE_KEY = 'helix_onboarding_done';

export function OnboardingFlow() {
  const [show, setShow] = useState(false);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const router = useRouter();

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setShow(true);
    } catch { /* ignore */ }
  }, []);

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* ignore */ }
    setShow(false);
  };

  const next = () => {
    if (step === STEPS.length - 1) { finish(); return; }
    setDirection(1);
    setStep(s => s + 1);
  };

  const back = () => {
    setDirection(-1);
    setStep(s => s - 1);
  };

  const goTo = (href?: string) => {
    finish();
    if (href) router.push(href);
  };

  const current = STEPS[step];
  const Icon = current.icon;

  return (
    <AnimatePresence>
      {show && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 20 }}
              className="w-full max-w-md bg-[#0d0d14] border border-[#2e2e3e] rounded-2xl shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-[#1e1e2e]">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded bg-indigo-600 flex items-center justify-center">
                    <Zap size={11} className="text-white" />
                  </div>
                  <span className="text-xs font-medium text-zinc-500">Helix — Getting started</span>
                </div>
                <button onClick={finish}>
                  <X size={15} className="text-zinc-600 hover:text-zinc-400" />
                </button>
              </div>

              {/* Content */}
              <div className="px-6 py-8 min-h-[280px] relative overflow-hidden">
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={step}
                    custom={direction}
                    initial={{ opacity: 0, x: direction * 40 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: direction * -40 }}
                    transition={{ duration: 0.25 }}
                    className="flex flex-col items-center text-center gap-5"
                  >
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                      style={{ background: `${current.color}15`, border: `1px solid ${current.color}30` }}>
                      <Icon size={28} style={{ color: current.color }} />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white mb-3">{current.title}</h2>
                      <p className="text-sm text-zinc-400 leading-relaxed">{current.desc}</p>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div className="px-6 pb-6">
                {/* Progress dots */}
                <div className="flex items-center justify-center gap-1.5 mb-5">
                  {STEPS.map((_, i) => (
                    <motion.div key={i}
                      animate={{ width: i === step ? 20 : 6, background: i === step ? '#6366f1' : '#2e2e3e' }}
                      className="h-1.5 rounded-full"
                    />
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  {step > 0 && (
                    <button onClick={back}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-zinc-500 hover:text-zinc-300 hover:bg-[#1a1a25] transition-colors">
                      <ArrowLeft size={13} /> Back
                    </button>
                  )}
                  <button onClick={finish} className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors ml-auto mr-1">
                    Skip tour
                  </button>
                  <button
                    onClick={() => current.href ? goTo(current.href) : next()}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm font-medium text-white transition-colors"
                  >
                    {current.cta}
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
