import axios from 'axios';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    console.error('API error:', err?.response?.data || err.message);
    return Promise.reject(err);
  }
);

export const uploadRepo = (file: File, onProgress?: (pct: number) => void) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/repos/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
};

export const getRepos = () => api.get('/repos');
export const getRepo = (id: string) => api.get(`/repos/${id}`);
export const getGraph = (id: string) => api.get(`/repos/${id}/graph`);
export const deleteRepo = (id: string) => api.delete(`/repos/${id}`);

export const sendChatMessage = async (
  repoId: string,
  message: string,
  onChunk: (chunk: string) => void
): Promise<void> => {
  const res = await fetch(`${BASE_URL}/repos/${repoId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!res.body) throw new Error('No response body');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
};