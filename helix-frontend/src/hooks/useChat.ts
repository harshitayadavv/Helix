'use client';
import { useState, useCallback } from 'react';
import { ChatMessage } from '@/types';
import { generateId } from '@/lib/utils';
import { sendChatMessage } from '@/lib/api';

export function useChat(repoId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);

  const send = useCallback(async (content: string) => {
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    const assistantId = generateId();
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setLoading(true);

    try {
      await sendChatMessage(repoId, content, (chunk) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: m.content + chunk } : m
          )
        );
      });
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: 'Failed to get response. Check your connection.', isStreaming: false }
            : m
        )
      );
    } finally {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, isStreaming: false } : m))
      );
      setLoading(false);
    }
  }, [repoId]);

  return { messages, loading, send };
}