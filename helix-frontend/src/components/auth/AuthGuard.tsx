'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';

const PUBLIC_DEMO_REPO_ID = process.env.NEXT_PUBLIC_DEMO_REPO_ID || '';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [checked, setChecked] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const isPublicDemoRoute =
      !!PUBLIC_DEMO_REPO_ID && pathname.startsWith(`/repo/${PUBLIC_DEMO_REPO_ID}`);

    if (isPublicDemoRoute) {
      setChecked(true);
      return;
    }

    try {
      const key = localStorage.getItem('helix_api_key');
      if (!key) {
        router.replace('/auth/login');
      } else {
        setChecked(true);
      }
    } catch {
      router.replace('/auth/login');
    }
  }, [router, pathname]);

  if (!checked) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0a0a0f]">
        <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}