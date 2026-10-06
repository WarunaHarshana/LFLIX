'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAppStore } from '@/app/store/useAppStore';

function WatchlistRedirectHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setActiveTab = useAppStore((state) => state.setActiveTab);

  useEffect(() => {
    setActiveTab('watchlist');
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.set('tab', 'watchlist');
    router.replace(`/?${params.toString()}`);
  }, [router, searchParams, setActiveTab]);

  return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white/60">
      <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
    </div>
  );
}

export default function WatchlistRoutePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white/60">
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
        </div>
      }
    >
      <WatchlistRedirectHandler />
    </Suspense>
  );
}
