'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface RepoContextValue {
  selectedRepoId: string | null;
  selectedRepoName: string | null;
  setSelectedRepo: (id: string, name: string) => void;
  clearSelectedRepo: () => void;
}

const RepoContext = createContext<RepoContextValue>({
  selectedRepoId: null,
  selectedRepoName: null,
  setSelectedRepo: () => {},
  clearSelectedRepo: () => {},
});

const STORAGE_KEY = 'helix_selected_repo';

export function RepoProvider({ children }: { children: ReactNode }) {
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [selectedRepoName, setSelectedRepoName] = useState<string | null>(null);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const { id, name } = JSON.parse(stored);
        setSelectedRepoId(id || null);
        setSelectedRepoName(name || null);
      }
    } catch { /* ignore */ }
  }, []);

  const setSelectedRepo = useCallback((id: string, name: string) => {
    setSelectedRepoId(id);
    setSelectedRepoName(name);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name })); } catch { /* ignore */ }
  }, []);

  const clearSelectedRepo = useCallback(() => {
    setSelectedRepoId(null);
    setSelectedRepoName(null);
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  return (
    <RepoContext.Provider value={{ selectedRepoId, selectedRepoName, setSelectedRepo, clearSelectedRepo }}>
      {children}
    </RepoContext.Provider>
  );
}

export function useRepo() {
  return useContext(RepoContext);
}
