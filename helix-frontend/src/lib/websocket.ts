import { ProcessingUpdate } from '@/types';

export class HelixWebSocket {
  private ws: WebSocket | null = null;
  private url: string;
  private onMessage: (update: ProcessingUpdate) => void;
  private onError: (err: Event) => void;
  private onClose: () => void;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private attempts = 0;
  private maxAttempts = 5;

  constructor(
    url: string,
    onMessage: (update: ProcessingUpdate) => void,
    onError: (err: Event) => void = () => {},
    onClose: () => void = () => {}
  ) {
    this.url = url;
    this.onMessage = onMessage;
    this.onError = onError;
    this.onClose = onClose;
  }

  connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data) as ProcessingUpdate;
          this.onMessage(data);
        } catch {
          console.warn('WS parse error:', e.data);
        }
      };
      this.ws.onerror = this.onError;
      this.ws.onclose = () => {
        this.onClose();
        this.scheduleReconnect();
      };
      this.ws.onopen = () => { this.attempts = 0; };
    } catch (err) {
      console.error('WS connect failed:', err);
    }
  }

  private scheduleReconnect() {
    if (this.attempts >= this.maxAttempts) return;
    this.attempts++;
    const delay = Math.min(1000 * 2 ** this.attempts, 30000);
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  get isConnected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}