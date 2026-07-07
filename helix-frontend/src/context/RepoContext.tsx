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

export function RepoProvider({ children }: { children: ReactNode }) {
  const [selectedRepoId, setSelectedRepoId] = useState<string | null>(null);
  const [selectedRepoName, setSelectedRepoName] = useState<string | null>(null);

  useEffect(() => {
    try {
      const id = localStorage.getItem('helix_selected_repo_id');
      const name = localStorage.getItem('helix_selected_repo_name');
      if (id) setSelectedRepoId(id);
      if (name) setSelectedRepoName(name);
    } catch { /* ignore */ }
  }, []);

  const setSelectedRepo = useCallback((id: string, name: string) => {
    setSelectedRepoId(id);
    setSelectedRepoName(name);
    try {
      localStorage.setItem('helix_selected_repo_id', id);
      localStorage.setItem('helix_selected_repo_name', name);
    } catch { /* ignore */ }
  }, []);

  const clearSelectedRepo = useCallback(() => {
    setSelectedRepoId(null);
    setSelectedRepoName(null);
    try {
      localStorage.removeItem('helix_selected_repo_id');
      localStorage.removeItem('helix_selected_repo_name');
    } catch { /* ignore */ }
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
