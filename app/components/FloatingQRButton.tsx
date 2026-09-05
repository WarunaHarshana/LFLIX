'use client';

import { Smartphone } from 'lucide-react';
import { useAppStore } from '@/app/store/useAppStore';

export default function FloatingQRButton() {
  const { setShowMobileConnect } = useAppStore();

  return (
    <div className="fixed bottom-24 right-4 z-40 md:hidden">
      <button
        onClick={() => setShowMobileConnect(true)}
        aria-label="Connect Mobile Device"
        title="Connect Mobile Device"
        className="w-14 h-14 bg-blue-600 hover:bg-blue-700 text-white rounded-full flex items-center justify-center shadow-lg transition transform hover:scale-105 active:scale-95 cursor-pointer"
      >
        <Smartphone className="w-6 h-6" />
      </button>
    </div>
  );
}
