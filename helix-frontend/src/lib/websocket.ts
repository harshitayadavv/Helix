import { generateId } from '@/lib/utils';

export type WsMessageType = 'progress' | 'analysis_complete' | 'error' | 'node_added' | 'ping';

export interface WsMessage {
  type: WsMessageType;
  data?: unknown;
  message?: string;
  progress?: number;
  stage?: string;
  repo_id?: string;
}

export class HelixWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private repoId: string;
  private clientId: string;
  private onMessage: (msg: WsMessage) => void;
  private onConnect: () => void;
  private onDisconnect: () => void;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private attempts = 0;
  private maxAttempts = 5;
  private destroyed = false;

  constructor(
    baseWsUrl: string,
    repoId: string,
    onMessage: (msg: WsMessage) => void,
    onConnect: () => void = () => {},
    onDisconnect: () => void = () => {}
  ) {
    this.clientId = generateId();
    this.url = `${baseWsUrl}/ws/${this.clientId}`;
    this.repoId = repoId;
    this.onMessage = onMessage;
    this.onConnect = onConnect;
    this.onDisconnect = onDisconnect;
  }

  connect() {
    if (this.destroyed) return;
    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.attempts = 0;
        // Subscribe to repo updates
        this.send({ subscribe: this.repoId });
        this.onConnect();
      };

      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as WsMessage;
          // Respond to ping
          if (msg.type === 'ping') {
            this.send({ type: 'pong' });
            return;
          }
          this.onMessage(msg);
        } catch {
          console.warn('WS parse error:', e.data);
        }
      };

      this.ws.onerror = () => {};
      this.ws.onclose = () => {
        this.onDisconnect();
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error('WS connect failed:', err);
      this.scheduleReconnect();
    }
  }

  private send(payload: Record<string, unknown>) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    }
  }

  private scheduleReconnect() {
    if (this.destroyed || this.attempts >= this.maxAttempts) return;
    this.attempts++;
    const delay = Math.min(1000 * 2 ** this.attempts, 30000);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    this.destroyed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
