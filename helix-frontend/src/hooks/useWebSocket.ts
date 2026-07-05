'use client';
import { useEffect, useRef, useState } from 'react';
import { HelixWebSocket, WsMessage } from '@/lib/websocket';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8001';

export function useWebSocket(repoId: string | null) {
  const [messages, setMessages] = useState<WsMessage[]>([]);
  const [latest, setLatest] = useState<WsMessage | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<HelixWebSocket | null>(null);

  useEffect(() => {
    if (!repoId) return;

    const ws = new HelixWebSocket(
      WS_BASE,
      repoId,
      (msg) => {
        setLatest(msg);
        setMessages(prev => [...prev, msg]);
      },
      () => setConnected(true),
      () => setConnected(false)
    );

    wsRef.current = ws;
    ws.connect();

    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [repoId]);

  return { messages, latest, connected };
}
