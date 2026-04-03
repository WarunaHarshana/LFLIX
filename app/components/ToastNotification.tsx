'use client';

import clsx from 'clsx';

type ToastNotificationProps = {
  toast: { message: string; type: 'success' | 'error' };
};

export default function ToastNotification({ toast }: ToastNotificationProps) {
  return (
    <div
      className={clsx(
        "fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-in slide-in-from-bottom duration-300",
        toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
      )}
    >
      {toast.type === 'success' ? '✓' : '✕'}
      <span>{toast.message}</span>
    </div>
  );
}
