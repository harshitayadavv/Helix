'use client';
import { useEffect, useRef, useState } from 'react';
import { HelixWebSocket } from '@/lib/websocket';
import { ProcessingUpdate } from '@/types';

export function useWebSocket(url: string | null) {
  const [updates, setUpdates] = useState<ProcessingUpdate[]>([]);
  const [latest, setLatest] = useState<ProcessingUpdate | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<HelixWebSocket | null>(null);

  useEffect(() => {
    if (!url) return;
    const ws = new HelixWebSocket(
      url,
      (update) => {
        setLatest(update);
        setUpdates((prev) => [...prev, update]);
      },
      () => setConnected(false),
      () => setConnected(false)
    );
    wsRef.current = ws;
    ws.connect();
    setConnected(true);
    return () => ws.disconnect();
  }, [url]);

  return { updates, latest, connected };
}