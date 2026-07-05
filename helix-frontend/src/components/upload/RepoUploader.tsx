'use client';
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileArchive, CheckCircle2, AlertCircle, FolderOpen, GitBranch, Loader2 } from 'lucide-react';
import { uploadRepo, cloneRepo } from '@/lib/api';
import { cn, formatBytes } from '@/lib/utils';

interface RepoUploaderProps {
  onUploadComplete?: (repoId: string) => void;
}

type UploadState = 'idle' | 'dragging' | 'uploading' | 'cloning' | 'success' | 'error';
type Tab = 'zip' | 'github';

export function RepoUploader({ onUploadComplete }: RepoUploaderProps) {
  const [tab, setTab] = useState<Tab>('zip');
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [branch, setBranch] = useState('main');
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setState('idle');
    setFile(null);
    setProgress(0);
    setError('');
    setGithubUrl('');
    setBranch('main');
  };

  // ── ZIP upload ──────────────────────────────────────────────────────────
  const handleFile = useCallback(async (f: File) => {
    if (!f.name.endsWith('.zip')) {
      setError('Only .zip files are supported');
      setState('error');
      return;
    }
    if (f.size > 100 * 1024 * 1024) {
      setError('File too large. Max 100 MB.');
      setState('error');
      return;
    }
    setFile(f);
    setState('uploading');
    setProgress(0);
    setError('');
    try {
      const res = await uploadRepo(f, setProgress);
      setState('success');
      onUploadComplete?.(res.data?.id || res.data?.repo_id || '');
    } catch {
      setError('Upload failed. Check your connection and try again.');
      setState('error');
    }
  }, [onUploadComplete]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState('idle');
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  }, [handleFile]);

  // ── GitHub clone ────────────────────────────────────────────────────────
  const handleClone = async () => {
    const url = githubUrl.trim();
    if (!url) { setError('GitHub URL is required.'); return; }
    if (!url.startsWith('https://github.com/')) {
      setError('URL must start with https://github.com/');
      return;
    }
    setError('');
    setState('cloning');
    try {
      // Pass both url and branch — backend expects { github_url, branch }
      const res = await cloneRepo(url, branch);
      setState('success');
      onUploadComplete?.(res.data?.id || res.data?.repo_id || '');
    } catch (err: unknown) {
      const response = (err as { response?: { data?: unknown } })?.response?.data;

      let msg = 'Clone failed. Check the URL and try again.';

      if (typeof response === 'string') {
        msg = response;
      } else if (response && typeof response === 'object') {
        const data = response as Record<string, unknown>;
        if (typeof data.detail === 'string') {
          msg = data.detail;
        } else if (Array.isArray(data.detail)) {
          // FastAPI validation error array
          msg = (data.detail as Array<{ msg: string }>).map(e => e.msg).join(', ');
        } else if (typeof data.msg === 'string') {
          msg = data.msg;
        }
      }

      setError(msg);
      setState('error');
    }
  };

  const isLoading = state === 'uploading' || state === 'cloning';

  return (
    <div className="w-full max-w-lg">
      {/* Tab toggle */}
      {(state === 'idle' || state === 'dragging') ? (
        <div className="flex items-center gap-1 bg-[#12121a] border border-[#1e1e2e] rounded-xl p-1 mb-3">
          <button
            onClick={() => setTab('zip')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
              tab === 'zip'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <FileArchive size={13} /> Upload ZIP
          </button>
          <button
            onClick={() => setTab('github')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-1.5 rounded-lg text-xs font-medium transition-colors',
              tab === 'github'
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <GitBranch size={13} /> Clone from GitHub
          </button>
        </div>
      ) : null}

      <AnimatePresence mode="wait">

        {/* ── ZIP: idle / dragging ── */}
        {tab === 'zip' && (state === 'idle' || state === 'dragging') && (
          <motion.div
            key="drop"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            onDrop={onDrop}
            onDragOver={e => { e.preventDefault(); setState('dragging'); }}
            onDragLeave={() => setState('idle')}
            onClick={() => inputRef.current?.click()}
            className={cn(
              'relative rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all duration-200',
              state === 'dragging'
                ? 'border-indigo-500 bg-indigo-500/5 scale-[1.01]'
                : 'border-[#2e2e3e] hover:border-[#3e3e4e] hover:bg-[#12121a]'
            )}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <motion.div animate={{ y: state === 'dragging' ? -4 : 0 }} className="flex flex-col items-center gap-3">
              <div className={cn(
                'w-14 h-14 rounded-2xl flex items-center justify-center transition-colors',
                state === 'dragging'
                  ? 'bg-indigo-600/20 border border-indigo-500/30'
                  : 'bg-[#1a1a25] border border-[#2e2e3e]'
              )}>
                {state === 'dragging'
                  ? <FolderOpen size={24} className="text-indigo-400" />
                  : <Upload size={24} className="text-zinc-500" />
                }
              </div>
              <div>
                <div className="text-sm font-semibold text-zinc-300 mb-1">
                  {state === 'dragging' ? 'Drop to upload' : 'Drop your ZIP here'}
                </div>
                <div className="text-xs text-zinc-600">or click to browse · max 100 MB</div>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-700">
                <FileArchive size={11} /><span>.zip archives only</span>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* ── GitHub: idle ── */}
        {tab === 'github' && (state === 'idle' || state === 'dragging') && (
          <motion.div
            key="github"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="rounded-2xl border border-[#1e1e2e] bg-[#12121a] p-6"
          >
            <div className="flex items-center gap-2.5 mb-5">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center">
                <GitBranch size={16} className="text-indigo-400" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Clone from GitHub</div>
                <div className="text-xs text-zinc-500">Public repositories only</div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">GitHub Repository URL</label>
                <input
                  value={githubUrl}
                  onChange={e => setGithubUrl(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleClone()}
                  placeholder="https://github.com/owner/repo"
                  className="w-full px-3 py-2.5 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-zinc-500 mb-1.5 block">Branch</label>
                <div className="relative">
                  <GitBranch size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                  <input
                    value={branch}
                    onChange={e => setBranch(e.target.value)}
                    placeholder="main"
                    className="w-full pl-8 pr-3 py-2.5 bg-[#0d0d14] border border-[#1e1e2e] rounded-xl text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2"
                >
                  <AlertCircle size={12} className="flex-shrink-0" />{error}
                </motion.div>
              )}

              <button
                onClick={handleClone}
                disabled={!githubUrl.trim() || isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-sm font-medium text-white transition-colors"
              >
                <GitBranch size={14} /> Clone Repository
              </button>
            </div>
          </motion.div>
        )}

        {/* ── Uploading / Cloning ── */}
        {isLoading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[#1e1e2e] bg-[#12121a] p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center">
                {state === 'cloning'
                  ? <GitBranch size={16} className="text-indigo-400" />
                  : <FileArchive size={16} className="text-indigo-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {state === 'cloning' ? githubUrl : file?.name}
                </div>
                <div className="text-xs text-zinc-500">
                  {state === 'cloning' ? `Branch: ${branch}` : file ? formatBytes(file.size) : ''}
                </div>
              </div>
              {state === 'uploading' && (
                <span className="text-sm font-semibold text-indigo-400">{progress}%</span>
              )}
              {state === 'cloning' && (
                <Loader2 size={16} className="text-indigo-400 animate-spin flex-shrink-0" />
              )}
            </div>

            {state === 'uploading' && (
              <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden mb-2">
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full"
                  initial={{ width: '0%' }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            )}

            {state === 'cloning' && (
              <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden mb-2">
                <motion.div
                  className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ width: '40%' }}
                />
              </div>
            )}

            <div className="text-xs text-zinc-600">
              {state === 'cloning' ? 'Cloning repository from GitHub...' : 'Uploading to Helix...'}
            </div>
          </motion.div>
        )}

        {/* ── Success ── */}
        {state === 'success' && (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6 text-center"
          >
            <CheckCircle2 size={32} className="text-green-400 mx-auto mb-2" />
            <div className="text-sm font-semibold text-green-300 mb-1">
              {tab === 'github' ? 'Clone started!' : 'Upload complete'}
            </div>
            <div className="text-xs text-zinc-500 mb-4">
              {tab === 'github'
                ? 'Repository is being cloned and processed in the background'
                : `${file?.name} is being processed`
              }
            </div>
            <button
              onClick={reset}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Add another
            </button>
          </motion.div>
        )}

        {/* ── Error ── */}
        {state === 'error' && (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center"
          >
            <AlertCircle size={32} className="text-red-400 mx-auto mb-2" />
            <div className="text-sm font-semibold text-red-300 mb-1">Failed</div>
            <div className="text-xs text-zinc-500 mb-4">{error}</div>
            <button
              onClick={reset}
              className="text-xs text-zinc-400 hover:text-zinc-200 bg-[#1a1a25] border border-[#2e2e3e] rounded-lg px-3 py-1.5 transition-colors"
            >
              Try again
            </button>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}