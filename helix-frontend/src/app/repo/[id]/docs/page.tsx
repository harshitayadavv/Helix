'use client';
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronDown, FileCode2, Folder, FolderOpen, Copy, Download, Sparkles, Check, RefreshCw } from 'lucide-react';
import { RepoEmptyState } from '@/components/common/RepoEmptyState';
import { generateDocs } from '@/lib/api';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'README', type: 'readme' },
  { label: 'API Docs', type: 'api' },
  { label: 'Architecture', type: 'architecture' },
  { label: 'Onboarding', type: 'onboarding' },
];

type TreeNode = { id: string; name: string; type: 'file'|'folder'; children?: TreeNode[] };

const FILE_TREE: TreeNode[] = [
  { id: '1', name: 'src', type: 'folder', children: [
    { id: '2', name: 'app.py', type: 'file' },
    { id: '3', name: 'auth.py', type: 'file' },
    { id: '4', name: 'models.py', type: 'file' },
    { id: '5', name: 'middleware.py', type: 'file' },
    { id: '6', name: 'db', type: 'folder', children: [{ id: '7', name: 'repo.py', type: 'file' }] },
  ]},
  { id: '8', name: 'tests', type: 'folder', children: [{ id: '9', name: 'test_auth.py', type: 'file' }] },
  { id: '10', name: 'requirements.txt', type: 'file' },
];

function FileNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(depth === 0);
  const isFolder = node.type === 'folder';
  return (
    <div>
      <button onClick={() => isFolder && setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-left hover:bg-[#1a1a25] rounded text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
        style={{ paddingLeft: `${8 + depth * 14}px` }}>
        {isFolder
          ? open ? <FolderOpen size={12} className="text-indigo-400 flex-shrink-0" /> : <Folder size={12} className="text-indigo-400 flex-shrink-0" />
          : <FileCode2 size={12} className="text-zinc-500 flex-shrink-0" />}
        <span className="truncate">{node.name}</span>
        {isFolder && (open ? <ChevronDown size={10} className="ml-auto text-zinc-700" /> : <ChevronRight size={10} className="ml-auto text-zinc-700" />)}
      </button>
      {isFolder && open && node.children?.map(child => <FileNode key={child.id} node={child} depth={depth + 1} />)}
    </div>
  );
}

export default function DocsPage({ params }: { params: { id: string } }) {
  const [activeTab, setActiveTab] = useState(0);
  const [content, setContent] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  const generate = useCallback(async () => {
    const tabType = TABS[activeTab].type;
    setGenerating(true);
    setContent(prev => ({ ...prev, [tabType]: '' }));
    try {
      const res = await generateDocs(params.id, tabType);
      const text: string = res.data?.content || res.data?.text || res.data?.markdown || '';
      let i = 0;
      const words = text.split(' ');
      const iv = setInterval(() => {
        i++;
        setContent(prev => ({ ...prev, [tabType]: words.slice(0, i).join(' ') }));
        if (i >= words.length) { clearInterval(iv); setGenerating(false); }
      }, 25);
    } catch {
      setContent(prev => ({ ...prev, [tabType]: 'Failed to generate documentation. Please try again.' }));
      setGenerating(false);
    }
  }, [activeTab, params.id]);

  const currentContent = content[TABS[activeTab].type] || '';

  const copy = () => {
    navigator.clipboard.writeText(currentContent).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const download = () => {
    const blob = new Blob([currentContent], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `helix-${TABS[activeTab].type}.md`;
    a.click();
  };

  return (
    <div className="flex flex-1 min-h-0">
      {/* File tree */}
      <div className="w-52 flex-shrink-0 border-r border-[#1e1e2e] bg-[#0d0d14] flex flex-col">
        <div className="px-3 py-2 border-b border-[#1e1e2e]">
          <div className="text-[10px] font-medium text-zinc-600 uppercase tracking-wider">Repository</div>
        </div>
        <div className="flex-1 overflow-y-auto p-1">
          {FILE_TREE.map(node => <FileNode key={node.id} node={node} />)}
        </div>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Tabs + actions */}
        <div className="flex items-center border-b border-[#1e1e2e] px-4 bg-[#0d0d14] flex-shrink-0">
          <div className="flex items-center gap-0.5 flex-1">
            {TABS.map((tab, i) => (
              <button key={tab.type} onClick={() => setActiveTab(i)}
                className={cn('px-4 py-3 text-xs font-medium border-b-2 transition-colors',
                  activeTab === i ? 'border-indigo-500 text-indigo-300' : 'border-transparent text-zinc-500 hover:text-zinc-300')}>
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 py-2">
            {currentContent && (
              <>
                <button onClick={copy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-[#12121a] border border-[#1e1e2e] rounded-lg transition-colors">
                  {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
                <button onClick={download}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-[#12121a] border border-[#1e1e2e] rounded-lg transition-colors">
                  <Download size={12} /> .md
                </button>
              </>
            )}
            <button onClick={generate} disabled={generating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg transition-colors font-medium">
              {generating ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {generating ? 'Generating...' : currentContent ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto">
            {!currentContent && !generating ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <RepoEmptyState icon={Sparkles} title={`No ${TABS[activeTab].label} yet`}
                  description={`Click Generate to create ${TABS[activeTab].label} documentation for this repository.`}
                  action={{ label: `Generate ${TABS[activeTab].label}`, onClick: generate }} />
              </div>
            ) : generating && !currentContent ? (
              <div className="space-y-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="h-3 bg-[#1e1e2e] rounded animate-pulse" style={{ width: `${60 + (i % 4) * 10}%` }} />
                ))}
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.pre key={activeTab} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="whitespace-pre-wrap text-sm text-zinc-300 leading-relaxed font-sans">
                  {currentContent}
                  {generating && <span className="inline-block w-0.5 h-4 bg-indigo-400 ml-0.5 animate-pulse align-middle" />}
                </motion.pre>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
