'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck, Trash2, X, Download, Tv, Film, AlertCircle } from 'lucide-react';
import { useNotifications, Notification } from '../hooks/useNotifications';

function timeAgo(dateStr: string): string {
  const now = Date.now();
  
  // SQLite returns 'YYYY-MM-DD HH:MM:SS' in UTC natively. We must format to ISO 8601 so JS parses as UTC.
  const safeDateStr = (!dateStr.includes('T') && !dateStr.includes('Z')) 
    ? dateStr.replace(' ', 'T') + 'Z' 
    : dateStr;

  const date = new Date(safeDateStr).getTime();
  const diff = Math.floor((now - date) / 1000);

  // Fallback for negative diffs (slight clock desyncs)
  if (diff < 0) return 'just now';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(safeDateStr).toLocaleDateString();
}

function NotificationIcon({ type }: { type: string }) {
  switch (type) {
    case 'new_episode':
      return <Tv size={16} className="text-blue-400" />;
    case 'download_started':
      return <Download size={16} className="text-amber-400" />;
    case 'download_complete':
      return <Check size={16} className="text-emerald-400" />;
    case 'movie_available':
      return <Film size={16} className="text-emerald-400" />;
    default:
      return <AlertCircle size={16} className="text-gray-400" />;
  }
}

function NotificationItem({
  notification,
  onMarkRead,
}: {
  notification: Notification;
  onMarkRead: (id: number) => void;
}) {
  const posterUrl = notification.posterPath
    ? `https://image.tmdb.org/t/p/w92${notification.posterPath}`
    : null;

  return (
    <div
      className={`flex items-start gap-3 px-4 py-3 transition-colors cursor-pointer
        ${notification.read ? 'opacity-60' : 'bg-neutral-800/30'}
        hover:bg-neutral-800`}
      onClick={() => !notification.read && onMarkRead(notification.id)}
    >
      {/* Poster thumbnail */}
      <div className="flex-shrink-0 w-10 h-14 rounded overflow-hidden bg-white/5">
        {posterUrl ? (
          <img src={posterUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <NotificationIcon type={notification.type} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <NotificationIcon type={notification.type} />
          <span className="text-xs font-medium text-white/70">{notification.title}</span>
          {!notification.read && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
          )}
        </div>
        <p className="text-sm text-white/90 leading-tight truncate">{notification.message}</p>
        <span className="text-xs text-white/40 mt-1 block">{timeAgo(notification.createdAt)}</span>
      </div>
    </div>
  );
}

export default function NotificationBell() {
  const {
    notifications,
    unreadCount,
    markAsRead,
    clearAll,
    requestPermission,
  } = useNotifications();

  const [isOpen, setIsOpen] = useState(false);
  const [hasRequestedPerms, setHasRequestedPerms] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Request notification permission on first open
  useEffect(() => {
    if (isOpen && !hasRequestedPerms) {
      setHasRequestedPerms(true);
      requestPermission();
    }
  }, [isOpen, hasRequestedPerms, requestPermission]);

  const handleMarkRead = (id: number) => {
    markAsRead([id]);
  };

  const handleMarkAllRead = () => {
    markAsRead();
  };

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-xl hover:bg-white/10 transition-all duration-200 group"
        aria-label="Notifications"
        id="notification-bell"
      >
        <Bell
          size={20}
          className={`transition-colors ${unreadCount > 0 ? 'text-white' : 'text-white/60 group-hover:text-white/80'}`}
        />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-600 rounded-full shadow-lg shadow-red-600/30 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 w-[380px] max-h-[520px] bg-neutral-900/95 backdrop-blur-xl border border-neutral-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden z-[200] flex flex-col animate-in fade-in slide-in-from-top-2 duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Bell size={16} />
              Notifications
              {unreadCount > 0 && (
                <span className="text-xs bg-red-600/20 text-red-500 px-2 py-0.5 rounded-full">
                  {unreadCount} new
                </span>
              )}
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
                  title="Mark all as read"
                >
                  <CheckCheck size={16} />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={clearAll}
                  className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-red-400"
                  title="Clear all"
                >
                  <Trash2 size={16} />
                </button>
              )}
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white/90"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-white/40">
                <Bell size={32} className="mb-3 opacity-30" />
                <p className="text-sm">No notifications yet</p>
                <p className="text-xs mt-1 text-white/25">
                  Track shows to get notified about new episodes
                </p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-800/50">
                {notifications.map((notif) => (
                  <NotificationItem
                    key={notif.id}
                    notification={notif}
                    onMarkRead={handleMarkRead}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
