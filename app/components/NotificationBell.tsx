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
      return <Tv size={13} className="text-blue-300" />;
    case 'download_started':
      return <Download size={13} className="text-amber-300" />;
    case 'download_failed':
      return <AlertCircle size={13} className="text-rose-300" />;
    case 'download_complete':
      return <Check size={13} className="text-teal-300" />;
    case 'movie_available':
      return <Film size={13} className="text-emerald-300" />;
    default:
      return <AlertCircle size={13} className="text-neutral-300" />;
  }
}

function getNotificationBadgeStyle(type: string): string {
  switch (type) {
    case 'new_episode':
      return 'bg-blue-500/15 border-blue-500/35 text-blue-300';
    case 'download_started':
      return 'bg-amber-500/15 border-amber-500/35 text-amber-300';
    case 'download_failed':
      return 'bg-rose-500/15 border-rose-500/35 text-rose-300';
    case 'download_complete':
      return 'bg-teal-500/15 border-teal-500/35 text-teal-300';
    case 'movie_available':
      return 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300';
    default:
      return 'bg-white/10 border-white/15 text-neutral-300';
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
      className={`relative flex items-start gap-3.5 p-3 rounded-2xl transition-all duration-200 cursor-pointer group ${
        notification.read
          ? 'bg-white/[0.02] border border-white/5 opacity-65 hover:opacity-100 hover:bg-white/[0.06] hover:border-white/15'
          : 'bg-white/[0.06] border border-white/12 hover:bg-white/[0.12] hover:border-white/25 shadow-sm'
      }`}
      onClick={() => !notification.read && onMarkRead(notification.id)}
    >
      {/* Poster thumbnail */}
      <div className="shrink-0 w-11 h-16 rounded-xl overflow-hidden border border-white/15 shadow-md bg-neutral-900 relative group-hover:scale-105 transition-transform duration-200">
        {posterUrl ? (
          <img src={posterUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-white/5">
            <NotificationIcon type={notification.type} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[10px] font-bold tracking-wide border uppercase ${getNotificationBadgeStyle(notification.type)}`}>
            <NotificationIcon type={notification.type} />
            {notification.title}
          </span>
          {!notification.read && (
            <span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.9)] shrink-0 animate-pulse" />
          )}
        </div>
        <p className="text-sm font-medium text-neutral-100 group-hover:text-white leading-snug mt-1.5 line-clamp-2">
          {notification.message}
        </p>
        <span className="text-[11px] font-medium text-neutral-400 mt-1.5 block">
          {timeAgo(notification.createdAt)}
        </span>
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
        className="liquid-glass-pill relative p-2.5 sm:p-3 rounded-xl transition-all duration-200 group cursor-pointer min-w-[44px] min-h-[44px] flex items-center justify-center"
        aria-label="Notifications"
        id="notification-bell"
      >
        <Bell
          size={20}
          className={`transition-colors ${unreadCount > 0 ? 'text-white' : 'text-neutral-200 group-hover:text-white'}`}
        />

        {/* Unread badge */}
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-600 rounded-full shadow-lg shadow-red-600/30 animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification panel */}
      {isOpen && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-3 w-[360px] sm:w-[410px] max-h-[540px] liquid-glass-base rounded-3xl border border-white/15 shadow-[0_25px_70px_rgba(0,0,0,0.85),0_0_30px_rgba(255,255,255,0.08)] backdrop-blur-2xl overflow-hidden z-[200] flex flex-col animate-in zoom-in-95 duration-200"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-white/[0.03] backdrop-blur-md shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 liquid-orb bg-white/10 border border-white/15 flex items-center justify-center text-white shrink-0">
                <Bell size={15} />
              </div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                Notifications
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/40 px-2.5 py-0.5 rounded-full shadow-[0_0_8px_rgba(239,68,68,0.3)]">
                    {unreadCount} new
                  </span>
                )}
              </h3>
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  aria-label="Mark all as read"
                  onClick={handleMarkAllRead}
                  className="w-8 h-8 liquid-orb bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                  title="Mark all as read"
                >
                  <CheckCheck size={15} />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  aria-label="Clear all"
                  onClick={clearAll}
                  className="w-8 h-8 liquid-orb bg-white/5 hover:bg-rose-500/20 text-neutral-300 hover:text-rose-300 flex items-center justify-center transition cursor-pointer"
                  title="Clear all"
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                aria-label="Close notifications"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 liquid-orb bg-white/5 hover:bg-white/15 text-neutral-300 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto scrollbar-thin p-3">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 liquid-orb bg-white/5 border border-white/10 flex items-center justify-center text-neutral-400 mb-3 shadow-lg">
                  <Bell size={24} className="opacity-60" />
                </div>
                <p className="text-sm font-bold text-white">All caught up!</p>
                <p className="text-xs text-neutral-400 mt-1 max-w-[220px] leading-relaxed">
                  Track shows and movies to get notified when new releases arrive
                </p>
              </div>
            ) : (
              <div className="space-y-2">
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
