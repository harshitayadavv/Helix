'use client';
import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface NavOptions {
  minMs?: number;
  maxMs?: number;
}

/**
 * Navigates to a route while guaranteeing a minimum loader duration
 * (so fast loads don't flash) and a maximum duration (so slow loads
 * don't hang forever — navigation proceeds anyway after maxMs).
 */
export function useNavigateWithDelay({ minMs = 2000, maxMs = 6000 }: NavOptions = {}) {
  const [pending, setPending] = useState(false);
  const [targetHref, setTargetHref] = useState<string | null>(null);
  const router = useRouter();
  const maxTimer = useRef<NodeJS.Timeout | null>(null);

  const navigate = useCallback((href: string) => {
    setPending(true);
    setTargetHref(href);
    const start = Date.now();

    router.prefetch(href);

    const finish = () => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(minMs - elapsed, 0);
      setTimeout(() => {
        router.push(href);
        setPending(false);
        setTargetHref(null);
      }, remaining);
    };

    const readyTimer = setTimeout(finish, 50);

    maxTimer.current = setTimeout(() => {
      clearTimeout(readyTimer);
      router.push(href);
      setPending(false);
      setTargetHref(null);
    }, maxMs);

    return () => {
      clearTimeout(readyTimer);
      if (maxTimer.current) clearTimeout(maxTimer.current);
    };
  }, [router, minMs, maxMs]);

  return { navigate, pending, targetHref };
}