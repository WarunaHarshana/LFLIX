'use client';

import { useState } from 'react';
import { Smartphone, X } from 'lucide-react';

export default function FloatingQRButton() {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className="fixed bottom-24 right-4 z-40 md:hidden">
      <button
        onClick={() => setShowTooltip(!showTooltip)}
        className="w-14 h-14 bg-blue-600 hover:bg-blue-700 rounded-full flex items-center justify-center shadow-lg transition transform hover:scale-105"
      >
        <Smartphone className="w-6 h-6" />
      </button>
      
      {showTooltip && (
        <div className="absolute bottom-16 right-0 bg-neutral-800 border border-neutral-700 rounded-lg p-3 shadow-xl whitespace-nowrap">
          <div className="flex items-center justify-between gap-4">
            <span className="text-sm">Connect another device</span>
            <button 
              onClick={() => setShowTooltip(false)}
              className="text-neutral-500 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
