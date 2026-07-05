import axios, { AxiosError } from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';

const getApiKey = () => {
  try { return localStorage.getItem('helix_api_key') || ''; } catch { return ''; }
};

export const api = axios.create({
  baseURL: `${BASE_URL}/api/v1`,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const key = getApiKey();
  if (key) config.headers['X-API-Key'] = key;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err: AxiosError) => {
    if (typeof window !== 'undefined') {
      if (err.response?.status === 401) window.location.href = '/auth/login';
      if (err.response?.status === 429) {
        const retryAfter = (err.response.headers as Record<string, string>)['retry-after'] || '60';
        window.dispatchEvent(new CustomEvent('helix:ratelimit', { detail: { retryAfter } }));
      }
    }
    return Promise.reject(err);
  }
);

// ─── Auth ─────────────────────────────────────────────────
export const loginUser = (email: string, password: string) =>
  api.post('/auth/login', { email, password });

export const registerUser = (name: string, email: string, password: string) =>
  api.post('/auth/register', { name, email, password });

export const getUsageStats = () => api.get('/auth/usage');

// ─── Repositories ─────────────────────────────────────────
export const uploadRepo = (file: File, onProgress?: (p: number) => void) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/repositories/upload', form, {
    timeout: 300000, // 5 minutes
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (e.total) onProgress?.(Math.round((e.loaded * 100) / e.total));
    },
  });
};

export const cloneRepo = (url: string, branch = 'main') =>
  api.post('/repositories/clone', { github_url: url, branch }, { 
    timeout: 300000  // 5 minutes
  });

export const getRepos = () => api.get('/repositories');

export const getRepo = (id: string) => api.get(`/repositories/${id}/status`);

export const deleteRepo = (id: string) => api.delete(`/repositories/${id}`);

export const getCommits = (id: string) => api.get(`/repositories/${id}/commits`);
export const getHotspots = (id: string) => api.get(`/repositories/${id}/hotspots`);
export const getContributors = (id: string) => api.get(`/repositories/${id}/contributors`);

// ─── Graph ────────────────────────────────────────────────
export const getGraph = (id: string) => api.get(`/graph/${id}/nodes`);
export const getGraphNodes = (id: string) => api.get(`/graph/${id}/nodes`);

// ─── Chat ─────────────────────────────────────────────────
// Backend returns complete JSON { answer, sources } — not a stream
export const sendChatMessage = async (
  repoId: string,
  question: string,
  onChunk: (chunk: string) => void
): Promise<void> => {
  const res = await api.post('/ai/ask', { repo_id: repoId, question });
  const answer: string = res.data?.answer || res.data?.response || '';
  // Simulate word-by-word for UX consistency
  const words = answer.split(' ');
  for (let i = 0; i < words.length; i++) {
    onChunk((i === 0 ? '' : ' ') + words[i]);
    await new Promise(r => setTimeout(r, 18));
  }
};

// ─── Analysis ─────────────────────────────────────────────
export const getHealth = (id: string) => api.get(`/analysis/health/${id}`);
export const runHealth = (id: string) => api.post(`/analysis/health/${id}`);

export const getSecurity = (id: string) => api.get(`/analysis/security/${id}`);
export const runSecurity = (id: string) => api.post(`/analysis/security/${id}`);

export const getSmells = (id: string) => api.get(`/analysis/smells/${id}`);
export const runSmells = (id: string) => api.post(`/analysis/smells/${id}`);

export const getPerformance = (id: string) => api.get(`/analysis/performance/${id}`);
export const runPerformance = (id: string) => api.post(`/analysis/performance/${id}`);

export const runImpact = (repoId: string, nodeId: string, nodeType: string) =>
  api.post('/analysis/impact', { repo_id: repoId, node_id: nodeId, node_type: nodeType });

// ─── Search ───────────────────────────────────────────────
export const searchCode = (query: string, repoId: string, type = 'all') =>
  api.get('/search', { params: { q: query, repo_id: repoId, type } });

export const getSearchHistory = (repoId: string) =>
  api.get(`/search/history/${repoId}`);

// ─── Docs ─────────────────────────────────────────────────
export const generateDocs = (repoId: string, docType: string) =>
  api.post(`/docs/generate/${repoId}`, { doc_type: docType });

// ─── Compare ──────────────────────────────────────────────
export const compareRepos = (repoA: string, repoB: string) =>
  api.get(`/comparison/${repoA}/${repoB}`);
