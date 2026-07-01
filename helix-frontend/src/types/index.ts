export type NodeType = 'file' | 'function' | 'class' | 'module';

export interface GraphNode {
  id: string;
  type: NodeType;
  name: string;
  path?: string;
  lines?: number;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type?: 'import' | 'call' | 'inherit' | 'use';
}

export interface Repository {
  id: string;
  name: string;
  status: 'uploading' | 'processing' | 'ready' | 'error';
  uploadedAt: string;
  stats: RepoStats;
}

export interface RepoStats {
  filesCount: number;
  functionsCount: number;
  classesCount: number;
  dependenciesCount: number;
  linesOfCode: number;
}

export interface ProcessingUpdate {
  stage: 'parsing' | 'analyzing' | 'graphing' | 'indexing' | 'complete';
  progress: number;
  message: string;
  current?: number;
  total?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  isStreaming?: boolean;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  error?: string;
}