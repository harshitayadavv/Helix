'use client';
import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileArchive, CheckCircle2, AlertCircle, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadRepo } from '@/lib/api';
import { cn, formatBytes } from '@/lib/utils';

interface RepoUploaderProps {
  onUploadComplete?: (repoId: string) => void;
}

type UploadState = 'idle' | 'dragging' | 'uploading' | 'success' | 'error';

export function RepoUploader({ onUploadComplete }: RepoUploaderProps) {
  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

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
      onUploadComplete?.(res.data.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      setError(message);
      setState('error');
    }
  }, [onUploadComplete]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setState('idle');
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  }, [handleFile]);

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setState('dragging'); };
  const onDragLeave = () => setState('idle');
  const reset = () => { setState('idle'); setFile(null); setProgress(0); setError(''); };

  return (
    <div className="w-full max-w-lg">
      <AnimatePresence mode="wait">
        {state === 'idle' || state === 'dragging' ? (
          <motion.div
            key="drop"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
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
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
            <motion.div animate={{ y: state === 'dragging' ? -4 : 0 }} className="flex flex-col items-center gap-3">
              <div className={cn(
                'w-14 h-14 rounded-2xl flex items-center justify-center transition-colors',
                state === 'dragging' ? 'bg-indigo-600/20 border border-indigo-500/30' : 'bg-[#1a1a25] border border-[#2e2e3e]'
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
                <FileArchive size={11} />
                <span>.zip archives only</span>
              </div>
            </motion.div>
          </motion.div>

        ) : state === 'uploading' ? (
          <motion.div key="upload" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-[#1e1e2e] bg-[#12121a] p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center">
                <FileArchive size={16} className="text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{file?.name}</div>
                <div className="text-xs text-zinc-500">{file ? formatBytes(file.size) : ''}</div>
              </div>
              <span className="text-sm font-semibold text-indigo-400">{progress}%</span>
            </div>
            <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-indigo-600 to-purple-500 rounded-full"
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <div className="text-xs text-zinc-600 mt-2">Uploading to Helix...</div>
          </motion.div>

        ) : state === 'success' ? (
          <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-green-500/20 bg-green-500/5 p-6 text-center">
            <CheckCircle2 size={32} className="text-green-400 mx-auto mb-2" />
            <div className="text-sm font-semibold text-green-300 mb-1">Upload complete</div>
            <div className="text-xs text-zinc-500 mb-4">{file?.name} is being processed</div>
            <Button variant="ghost" size="sm" onClick={reset}>Upload another</Button>
          </motion.div>

        ) : (
          <motion.div key="error" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <AlertCircle size={32} className="text-red-400 mx-auto mb-2" />
            <div className="text-sm font-semibold text-red-300 mb-1">Upload failed</div>
            <div className="text-xs text-zinc-500 mb-4">{error}</div>
            <Button variant="ghost" size="sm" onClick={reset}>Try again</Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}