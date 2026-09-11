'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Trophy,
  Play,
  X,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  Tv,
  Maximize,
  Minimize,
  SlidersHorizontal,
  Search,
  RotateCw,
  ExternalLink,
  Sparkles,
  FilterX
} from 'lucide-react';
import { useModalBehavior } from '@/app/hooks/useModalBehavior';
import LiquidDropdown from './LiquidDropdown';

type Sport = {
  id: string;
  name: string;
  icon?: string;
};

type Team = {
  name: string;
  badge?: string | null;
};

type StreamSource = {
  source: string;
  id: string;
};

type Match = {
  id: string;
  title: string;
  category: string;
  date: number;
  poster: string | null;
  popular: boolean;
  teams?: {
    home?: Team;
    away?: Team;
  };
  sources: StreamSource[];
  isLive: boolean;
  is4k?: boolean;
};

type Stream = {
  id: string;
  streamNo: number;
  language: string;
  hd: boolean;
  is4k?: boolean;
  embedUrl?: string;
  source: string;
};

function resolveMediaUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/api/')) return `https://streamed.pk${path}`;
  if (path.startsWith('/')) return `https://streamed.pk${path}`;
  return `https://streamed.pk/api/images/proxy/${path}.webp`;
}

function getSportBackdrop(category?: string): string {
  const cat = (category || '').toLowerCase();
  if (cat.includes('football') || cat.includes('soccer')) {
    return 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=800&q=80';
  }
  if (cat.includes('tennis')) {
    return 'https://images.unsplash.com/photo-1554068865-24cecd4e34b8?auto=format&fit=crop&w=800&q=80';
  }
  if (cat.includes('basket') || cat.includes('nba')) {
    return 'https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=800&q=80';
  }
  if (cat.includes('mma') || cat.includes('box') || cat.includes('fight') || cat.includes('ufc') || cat.includes('combat')) {
    return 'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?auto=format&fit=crop&w=800&q=80';
  }
  if (cat.includes('motor') || cat.includes('f1') || cat.includes('race') || cat.includes('formula')) {
    return 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&w=800&q=80';
  }
  if (cat.includes('american') || cat.includes('nfl')) {
    return 'https://images.unsplash.com/photo-1566577739112-5180d4bf9390?auto=format&fit=crop&w=800&q=80';
  }
  if (cat.includes('baseball') || cat.includes('mlb')) {
    return 'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?auto=format&fit=crop&w=800&q=80';
  }
  if (cat.includes('snooker') || cat.includes('pool') || cat.includes('billiard')) {
    return 'https://images.unsplash.com/photo-1534158914592-062992fbe900?auto=format&fit=crop&w=800&q=80';
  }
  if (cat.includes('hockey')) {
    return 'https://www.thesportsdb.com/images/sports/ice_hockey.jpg';
  }
  if (cat.includes('cricket')) {
    return 'https://www.thesportsdb.com/images/sports/cricket.jpg';
  }
  if (cat.includes('rugby') || cat.includes('afl')) {
    return 'https://www.thesportsdb.com/images/sports/rugby.jpg';
  }
  if (cat.includes('golf')) {
    return 'https://www.thesportsdb.com/images/sports/golf.jpg';
  }
  if (cat.includes('dart')) {
    return 'https://www.thesportsdb.com/images/sports/darts.jpg';
  }
  return 'https://images.unsplash.com/photo-1587280501635-68a0e82cd5ff?auto=format&fit=crop&w=800&q=80';
}

function getTeamInitials(name?: string): string {
  if (!name) return 'VS';
  const clean = name.replace(/^[-–\s]+/, '').replace(/^W\s*\d+:\s*/i, '').trim();
  const parts = clean.split(/[\s-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase() || 'TM';
}

/**
 * Professional, modern minimalist SVG vector icons for each sport.
 * Replaces colorful smartphone emojis with razor-sharp graphics.
 */
function SportVectorIcon({ sport, className = "w-4 h-4" }: { sport?: string; className?: string }) {
  const s = (sport || '').toLowerCase().trim();

  if (s.includes('football') || s.includes('soccer')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polygon points="12 8 8 11 9.5 15.5 14.5 15.5 16 11 12 8" />
        <path d="M12 2v6" />
        <path d="M12 18v4" />
        <path d="M4.93 4.93l4.24 3.07" />
        <path d="M19.07 4.93l-4.24 3.07" />
        <path d="M2.05 12h5.95" />
        <path d="M16 12h5.95" />
        <path d="M4.93 19.07l4.24-3.07" />
        <path d="M19.07 19.07l-4.24-3.07" />
      </svg>
    );
  }
  if (s.includes('basket')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        <path d="M5.5 5.5c3 3 3 10 0 13" />
        <path d="M18.5 5.5c-3 3-3 10 0 13" />
      </svg>
    );
  }
  if (s.includes('tennis')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2.5 12a14.5 14.5 0 0 0 19 0" />
        <path d="M2.5 12a14.5 14.5 0 0 1 19 0" />
        <path d="M12 2.5a14.5 14.5 0 0 0 0 19" />
        <path d="M12 2.5a14.5 14.5 0 0 1 0 19" />
      </svg>
    );
  }
  if (s.includes('fight') || s.includes('mma') || s.includes('box') || s.includes('combat')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.5 4h-5L7 7v4l2 3v6h6v-6l2-3V7l-2.5-3z" />
        <path d="M7 11h10" />
        <path d="M9 14h6" />
        <circle cx="12" cy="6" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (s.includes('motor') || s.includes('formula') || s.includes('f1') || s.includes('race')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
        <line x1="4" y1="22" x2="4" y2="15" />
      </svg>
    );
  }
  if (s.includes('american') || s.includes('nfl')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="12" rx="10" ry="6" transform="rotate(-45 12 12)" />
        <line x1="9" y1="9" x2="15" y2="15" />
        <line x1="10" y1="12" x2="12" y2="10" />
        <line x1="12" y1="14" x2="14" y2="12" />
      </svg>
    );
  }
  if (s.includes('baseball') || s.includes('mlb')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M6 3c2 3 2 15 0 18" />
        <path d="M18 3c-2 3-2 15 0 18" />
        <line x1="7" y1="7" x2="5" y2="8" />
        <line x1="7" y1="12" x2="5" y2="12" />
        <line x1="7" y1="17" x2="5" y2="16" />
        <line x1="17" y1="7" x2="19" y2="8" />
        <line x1="17" y1="12" x2="19" y2="12" />
        <line x1="17" y1="17" x2="19" y2="16" />
      </svg>
    );
  }
  if (s.includes('hockey')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19h5l7-15" />
        <path d="M20 19h-5L8 4" />
        <ellipse cx="12" cy="19" rx="3" ry="1.5" />
      </svg>
    );
  }
  if (s.includes('cricket')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 20l9-14 3 2-9 14z" />
        <circle cx="18" cy="18" r="3" />
        <line x1="3" y1="21" x2="6" y2="18" />
      </svg>
    );
  }
  if (s.includes('billiards') || s.includes('snooker') || s.includes('pool')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" strokeWidth="1.5" />
        <text x="12" y="14" fontSize="6" fontWeight="bold" textAnchor="middle" fill="currentColor">8</text>
      </svg>
    );
  }
  if (s.includes('rugby') || s.includes('afl')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <ellipse cx="12" cy="12" rx="10" ry="6" />
        <line x1="12" y1="6" x2="12" y2="18" />
        <path d="M6 9c2 1 2 5 0 6" />
        <path d="M18 9c-2 1-2 5 0 6" />
      </svg>
    );
  }
  if (s.includes('golf')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3v18" />
        <path d="M6 4l10 4-10 4z" />
        <circle cx="18" cy="19" r="2" />
      </svg>
    );
  }
  if (s.includes('dart')) {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" fill="currentColor" />
      </svg>
    );
  }
  if (s === '4k') {
    return (
      <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="15" rx="2" ry="2" />
        <polyline points="17 2 12 7 7 2" />
      </svg>
    );
  }
  return <Trophy className={className} />;
}

function matchesSport(matchCat: string, targetSport: string): boolean {
  if (!targetSport || targetSport === 'all') return true;
  const m = matchCat.toLowerCase().trim();
  const t = targetSport.toLowerCase().trim();

  if (m === t) return true;

  if (t === 'fight' && ['mma', 'boxing', 'combat'].includes(m)) return true;
  if (['mma', 'boxing'].includes(t) && m === 'fight') return true;

  if (t === 'motor-sports' && ['motorsport', 'formula1', 'formula'].includes(m)) return true;
  if (['formula1', 'motorsport'].includes(t) && m === 'motor-sports') return true;

  if (t === 'billiards' && ['snooker', 'pool'].includes(m)) return true;
  if (['snooker', 'pool'].includes(t) && m === 'billiards') return true;

  if (t === 'rugby' && m === 'afl') return true;
  if (t === 'afl' && m === 'rugby') return true;

  if (t === 'football' && ['soccer', 'futsal'].includes(m)) return true;
  if (['soccer', 'futsal'].includes(t) && m === 'football') return true;

  return false;
}

function TeamBadge({ name, badge, size = 'sm' }: { name?: string; badge?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const [error, setError] = useState(false);
  const resolved = resolveMediaUrl(badge);

  if (!resolved || error) {
    if (size === 'sm') return null;
    return (
      <div className={`rounded-2xl bg-white/[0.06] border border-white/15 flex items-center justify-center font-bold text-neutral-300 shadow-md backdrop-blur-md shrink-0 select-none font-mono ${
        size === 'lg' ? 'w-13 h-13 text-sm' : 'w-9 h-9 text-xs'
      }`}>
        {name ? getTeamInitials(name) : 'TM'}
      </div>
    );
  }

  return (
    <img
      src={resolved}
      alt={name || ''}
      onError={() => setError(true)}
      className={`object-contain shrink-0 drop-shadow-md transition-transform duration-300 ${
        size === 'lg' ? 'w-13 h-13 group-hover:scale-110' : size === 'md' ? 'w-9 h-9' : 'w-4 h-4'
      }`}
    />
  );
}

function SportCard({
  match,
  isSelected,
  isLoadingStream,
  onWatch,
  formatTime,
}: {
  match: Match;
  isSelected: boolean;
  isLoadingStream: boolean;
  onWatch: () => void;
  formatTime: (time: number) => string;
}) {
  const [imgError, setImgError] = useState(false);
  const posterUrl = resolveMediaUrl(match.poster);
  const backdropUrl = getSportBackdrop(match.category);
  const displayImage = (!imgError && posterUrl) ? posterUrl : backdropUrl;

  const homeBadge = resolveMediaUrl(match.teams?.home?.badge);
  const awayBadge = resolveMediaUrl(match.teams?.away?.badge);

  return (
    <div
      tabIndex={0}
      role="button"
      aria-label={`Watch ${match.title}`}
      onClick={onWatch}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onWatch();
        }
      }}
      className={`group relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.04] hover:z-30 liquid-card liquid-sheen-effect shadow-xl hover:shadow-[0_20px_50px_rgba(0,0,0,0.85),0_0_24px_rgba(255,255,255,0.12)] border focus:outline-none focus:ring-2 focus:ring-white/60 ${
        isSelected
          ? 'border-white/60 shadow-[0_0_30px_rgba(255,255,255,0.3)] ring-1 ring-white/50'
          : 'border-white/10 hover:border-white/30'
      }`}
    >
      {/* 100% Full-Bleed Photographic Artwork */}
      <img
        src={displayImage}
        alt={match.title}
        onError={() => setImgError(true)}
        className="w-full h-full object-cover transition duration-500 group-hover:scale-105 group-hover:brightness-95"
      />

      {/* Top Vignette Gradient for High Badge Contrast */}
      <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/85 via-black/40 to-transparent pointer-events-none z-10" />

      {/* Top Left Badges: LIVE or Time */}
      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-20 pointer-events-none">
        {match.isLive ? (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/90 text-white text-[10px] font-extrabold shadow-[0_0_14px_rgba(239,68,68,0.6)] border border-red-400/40 backdrop-blur-md select-none tracking-wider uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            LIVE
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/70 text-neutral-200 border border-white/15 text-[10px] font-semibold backdrop-blur-md select-none shadow-md">
            <Clock className="w-3 h-3 text-neutral-400 shrink-0" />
            <span>{formatTime(match.date)}</span>
          </span>
        )}
      </div>

      {/* Top Right Badges: 4K, Popular, Sport */}
      <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1.5 z-20 pointer-events-none">
        {match.is4k && (
          <span className="px-2 py-0.5 text-[10px] rounded-full font-bold tracking-wider bg-purple-950/70 text-purple-300 border border-purple-500/40 backdrop-blur-md shadow-sm uppercase">
            4K UHD
          </span>
        )}
        {match.popular && (
          <span className="px-2.5 py-1 text-[10px] rounded-full font-bold tracking-wider bg-amber-950/70 text-amber-300 border border-amber-500/40 backdrop-blur-md shadow-sm uppercase flex items-center gap-1">
            <span className="text-amber-400 text-[9px]">★</span> POPULAR
          </span>
        )}
        <span className="px-2.5 py-1 text-[10px] rounded-full font-medium tracking-wide bg-black/65 text-neutral-300 border border-white/15 backdrop-blur-md shadow-sm capitalize inline-flex items-center gap-1.5">
          <SportVectorIcon sport={match.category} className="w-3 h-3 text-neutral-400" />
          <span>{match.category}</span>
        </span>
      </div>

      {/* Center Matchup Crests */}
      {homeBadge && awayBadge && (
        <div className="absolute inset-0 flex items-center justify-center gap-3 pointer-events-none pb-14 z-10">
          <div className="w-12 h-12 p-2 rounded-2xl bg-black/65 backdrop-blur-md border border-white/20 shadow-2xl group-hover:scale-110 transition duration-300 flex items-center justify-center">
            <img src={homeBadge} alt="" className="w-full h-full object-contain drop-shadow-md" />
          </div>
          <div className="w-7 h-7 rounded-full bg-neutral-900/90 border border-white/20 text-[10px] font-black text-red-400 shadow-xl flex items-center justify-center tracking-wider backdrop-blur-md">
            VS
          </div>
          <div className="w-12 h-12 p-2 rounded-2xl bg-black/65 backdrop-blur-md border border-white/20 shadow-2xl group-hover:scale-110 transition duration-300 flex items-center justify-center">
            <img src={awayBadge} alt="" className="w-full h-full object-contain drop-shadow-md" />
          </div>
        </div>
      )}

      {/* Bottom Gradient & Match Info */}
      <div className="absolute inset-x-0 bottom-0 p-3.5 bg-gradient-to-t from-black via-black/90 to-transparent pt-20 z-10 pointer-events-none transition-transform duration-300">
        <h3 className="font-bold text-white text-xs sm:text-sm line-clamp-2 drop-shadow-md leading-snug mb-1.5">
          {match.teams?.home && match.teams?.away ? (
            <>
              <span>{match.teams.home.name}</span>
              <span className="text-red-400 font-extrabold text-[10px] mx-1">VS</span>
              <span>{match.teams.away.name}</span>
            </>
          ) : (
            match.title
          )}
        </h3>

        <div className="flex items-center justify-between text-[11px] text-neutral-300">
          <div className="flex items-center gap-1.5 font-medium text-neutral-400">
            <Tv className="w-3 h-3 text-neutral-400" />
            <span>{match.sources.length} {match.sources.length === 1 ? 'feed' : 'feeds'}</span>
          </div>

          <div className="flex items-center gap-1">
            {match.sources.slice(0, 2).map((src, i) => (
              <span
                key={i}
                className="text-[9px] font-semibold px-2 py-0.5 rounded-md bg-white/[0.08] text-neutral-300 border border-white/10 uppercase tracking-wider backdrop-blur-sm"
              >
                {src.source}
              </span>
            ))}
            {match.sources.length > 2 && (
              <span className="text-[9px] text-neutral-400 font-mono">
                +{match.sources.length - 2}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Hover Overlay with Red Liquid Watch Button */}
      <div className="absolute inset-0 p-4 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center bg-black/65 backdrop-blur-[2px] z-20 pointer-events-none">
        {isLoadingStream ? (
          <div className="flex flex-col items-center gap-2">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/30 border-t-red-500" />
            <span className="text-xs font-bold text-white">Loading Feeds...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2.5 transform scale-95 group-hover:scale-100 transition-transform duration-300">
            <div className="w-13 h-13 rounded-full liquid-btn-primary flex items-center justify-center shadow-[0_8px_30px_rgba(255,255,255,0.35)]">
              <Play className="w-5 h-5 fill-black text-black ml-0.5" />
            </div>
            <span className="px-5 py-2 rounded-xl liquid-btn-primary text-black text-xs sm:text-sm font-bold shadow-lg flex items-center gap-1.5">
              <span>{match.isLive ? 'Watch Live Match' : 'Watch Match'}</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

type Props = {
  onClose: () => void;
};

export default function LiveSports({ onClose }: Props) {
  useModalBehavior(true, onClose);

  const [sports, setSports] = useState<Sport[]>([]);
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const [rawMatches, setRawMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [only4k, setOnly4k] = useState(false);

  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [loadingStreams, setLoadingStreams] = useState(false);
  const [activeTab, setActiveTab] = useState<'live' | 'today'>('live');
  const [selectedStream, setSelectedStream] = useState<Stream | null>(null);
  const [sortByQuality, setSortByQuality] = useState(true);
  const [streamReloadKey, setStreamReloadKey] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [qualities, setQualities] = useState<{ index: number; label: string }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1);
  const hlsRef = useRef<any>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const timeoutRef = useRef<any>(null);

  // Category scrollpane state and handlers
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [showCategoryLeftArrow, setShowCategoryLeftArrow] = useState(false);
  const [showCategoryRightArrow, setShowCategoryRightArrow] = useState(false);

  const updateCategoryScrollState = useCallback(() => {
    if (!categoryScrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = categoryScrollRef.current;
    setShowCategoryLeftArrow(scrollLeft > 6);
    setShowCategoryRightArrow(scrollLeft + clientWidth < scrollWidth - 6);
  }, []);

  useEffect(() => {
    updateCategoryScrollState();
    const el = categoryScrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateCategoryScrollState, { passive: true });
    window.addEventListener('resize', updateCategoryScrollState);
    const t = setTimeout(updateCategoryScrollState, 150);
    return () => {
      clearTimeout(t);
      el.removeEventListener('scroll', updateCategoryScrollState);
      window.removeEventListener('resize', updateCategoryScrollState);
    };
  }, [updateCategoryScrollState, sports, rawMatches]);

  const scrollCategories = (direction: 'left' | 'right') => {
    if (!categoryScrollRef.current) return;
    const amount = Math.max(categoryScrollRef.current.clientWidth * 0.6, 260);
    categoryScrollRef.current.scrollBy({
      left: direction === 'left' ? -amount : amount,
      behavior: 'smooth'
    });
  };

  const handleCategoryWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY !== 0 && categoryScrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = categoryScrollRef.current;
      const canScrollLeft = e.deltaY < 0 && scrollLeft > 0;
      const canScrollRight = e.deltaY > 0 && scrollLeft + clientWidth < scrollWidth - 1;
      if (canScrollLeft || canScrollRight) {
        categoryScrollRef.current.scrollLeft += e.deltaY;
      }
    }
  };

  const selectSportAndEnsureVisible = (sportId: string, event?: React.MouseEvent<HTMLButtonElement>) => {
    setSelectedSport(sportId);
    if (event?.currentTarget) {
      event.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  };

  // Activity handler to show controls and start hide timer
  const handleActivity = useCallback(() => {
    setShowControls(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  }, []);

  // Activity tracking for showing/hiding controls and cursor
  useEffect(() => {
    if (!selectedStream) {
      setShowControls(true);
      return;
    }

    handleActivity();

    const container = containerRef.current;
    const handleMouseLeave = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setShowControls(false);
    };

    if (container) {
      container.addEventListener('mousemove', handleActivity);
      container.addEventListener('mousedown', handleActivity);
      container.addEventListener('touchstart', handleActivity);
      container.addEventListener('mouseleave', handleMouseLeave);
    }

    document.addEventListener('keydown', handleActivity);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (container) {
        container.removeEventListener('mousemove', handleActivity);
        container.removeEventListener('mousedown', handleActivity);
        container.removeEventListener('touchstart', handleActivity);
        container.removeEventListener('mouseleave', handleMouseLeave);
      }
      document.removeEventListener('keydown', handleActivity);
    };
  }, [selectedStream, handleActivity]);

  // Track fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      } else {
        containerRef.current.requestFullscreen().catch(() => {});
      }
    }
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && event.target instanceof Node && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleQualityChange = (index: number) => {
    setCurrentQuality(index);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = index;
    }
  };

  // Setup HLS.js for direct video streams (.m3u8)
  useEffect(() => {
    setQualities([]);
    setCurrentQuality(-1);
    hlsRef.current = null;
    if (!selectedStream) return;
    const video = videoRef.current;
    if (!video) return;

    const { embedUrl } = selectedStream;
    if (!embedUrl) return;

    const isIframe = embedUrl.includes('embed') ||
                     embedUrl.includes('play/') ||
                     embedUrl.includes('pages.dev') ||
                     embedUrl.includes('html') ||
                     embedUrl.includes('cdx-') ||
                     selectedStream.source === 'streami' ||
                     selectedStream.source === 'timstreams' ||
                     selectedStream.source === 'xyzstreams';

    if (isIframe) return;

    let hls: any;
    import('hls.js').then(({ default: Hls }) => {
      if (!videoRef.current) return;
      if (Hls.isSupported()) {
        hls = new Hls({ enableWorker: true });
        hls.loadSource(embedUrl);
        hls.attachMedia(videoRef.current);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const levels = hls.levels.map((level: any, idx: number) => {
            const label = level.name || (level.height ? `${level.height}p` : `${Math.round(level.bitrate / 1000)}k`);
            return { index: idx, label };
          });
          setQualities([{ index: -1, label: 'Auto' }, ...levels]);
          videoRef.current?.play().catch(() => {});
        });
        hlsRef.current = hls;
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = embedUrl;
        video.play().catch(() => {});
      } else {
        video.src = embedUrl;
        video.play().catch(() => {});
      }
    });

    return () => {
      if (hls) {
        hls.destroy();
      }
      hlsRef.current = null;
    };
  }, [selectedStream, streamReloadKey]);

  // Video requestFullscreen redirect to containerRef
  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const originalRequestFullscreen = video.requestFullscreen || (video as any).webkitRequestFullscreen;

    const customRequestFullscreen = function (options?: FullscreenOptions) {
      if (container.requestFullscreen) {
        return container.requestFullscreen(options);
      } else if ((container as any).webkitRequestFullscreen) {
        return (container as any).webkitRequestFullscreen(options);
      }
      return originalRequestFullscreen.call(video, options);
    };

    (video as any).requestFullscreen = customRequestFullscreen;
    (video as any).webkitRequestFullscreen = customRequestFullscreen;

    const handleDblClick = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggleFullscreen();
    };

    video.addEventListener('dblclick', handleDblClick);

    return () => {
      (video as any).requestFullscreen = originalRequestFullscreen;
      (video as any).webkitRequestFullscreen = originalRequestFullscreen;
      video.removeEventListener('dblclick', handleDblClick);
    };
  }, [selectedStream]);

  // Fetch sports categories
  useEffect(() => {
    fetch('/api/sports/categories')
      .then(res => res.json())
      .then(data => {
        if (data.sports && Array.isArray(data.sports)) {
          setSports(data.sports);
        }
      })
      .catch(() => {
        setSports([
          { id: 'football', name: 'Football' },
          { id: 'basketball', name: 'Basketball' },
          { id: 'fight', name: 'MMA & Boxing' },
          { id: 'motor-sports', name: 'Motorsport & F1' },
          { id: 'tennis', name: 'Tennis' },
          { id: 'american-football', name: 'American Football' },
          { id: 'baseball', name: 'Baseball' },
          { id: 'hockey', name: 'Ice Hockey' },
          { id: 'cricket', name: 'Cricket' },
          { id: 'billiards', name: 'Snooker & Pool' },
          { id: 'rugby', name: 'Rugby & AFL' },
          { id: 'golf', name: 'Golf' },
          { id: 'darts', name: 'Darts' },
        ]);
      });
  }, []);

  // Fetch all matches for the current tab
  const fetchMatches = useCallback((isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setError('');

    const params = new URLSearchParams();
    params.set('type', activeTab);
    params.set('sport', 'all');

    fetch(`/api/sports/matches?${params}`)
      .then(res => res.json())
      .then(data => {
        if (data.matches && Array.isArray(data.matches)) {
          setRawMatches(data.matches);
        } else {
          setRawMatches([]);
          setError('No matches found');
        }
        setLoading(false);
        setIsRefreshing(false);
      })
      .catch(() => {
        setError('Failed to load matches');
        setLoading(false);
        setIsRefreshing(false);
      });
  }, [activeTab]);

  useEffect(() => {
    fetchMatches(false);
  }, [fetchMatches]);

  // Compute live match counts per category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: rawMatches.length, '4k': 0 };
    for (const m of rawMatches) {
      if (m.is4k) counts['4k'] = (counts['4k'] || 0) + 1;
      const cat = (m.category || 'other').toLowerCase();
      counts[cat] = (counts[cat] || 0) + 1;
    }
    for (const sport of sports) {
      const sportKey = sport.id.toLowerCase();
      counts[sportKey] = rawMatches.filter(m => matchesSport(m.category, sportKey)).length;
    }
    return counts;
  }, [rawMatches, sports]);

  // Client-side filtering for fast and responsive UX
  const filteredMatches = useMemo(() => {
    let result = rawMatches;

    // 4K filter toggle
    if (only4k) {
      result = result.filter(m => m.is4k);
    }

    // Sport category filter
    if (selectedSport === '4k') {
      result = result.filter(m => m.is4k);
    } else if (selectedSport !== 'all') {
      result = result.filter(m => matchesSport(m.category, selectedSport));
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(m => {
        const titleMatch = m.title?.toLowerCase().includes(q);
        const homeMatch = m.teams?.home?.name?.toLowerCase().includes(q);
        const awayMatch = m.teams?.away?.name?.toLowerCase().includes(q);
        const catMatch = m.category?.toLowerCase().includes(q);
        return titleMatch || homeMatch || awayMatch || catMatch;
      });
    }

    return result;
  }, [rawMatches, selectedSport, only4k, searchQuery]);

  const loadStreams = async (match: Match) => {
    setLoadingStreams(true);
    setSelectedMatch(match);
    setSelectedStream(null);
    setStreams([]);
    window.scrollTo({ top: 0, behavior: 'smooth' });

    try {
      const fetchPromises = match.sources.map(async (source) => {
        try {
          const res = await fetch(`/api/sports/streams?source=${source.source}&id=${source.id}`);
          if (!res.ok) return [];
          const data = await res.json();
          return data.streams || [];
        } catch (err) {
          console.error(`Error loading stream source ${source.source}:`, err);
          return [];
        }
      });

      const results = await Promise.all(fetchPromises);
      const allStreams = results.flat();

      if (allStreams.length > 0) {
        const seenIds = new Set<string>();
        const uniqueStreams = allStreams.map((st, idx) => {
          let uniqueId = st.id || `stream-${idx + 1}`;
          if (seenIds.has(uniqueId)) {
            uniqueId = `${uniqueId}-${idx + 1}`;
          }
          seenIds.add(uniqueId);
          return { ...st, id: uniqueId };
        });

        setStreams(uniqueStreams);
        if (sortByQuality) {
          const sorted = [...uniqueStreams].sort((a, b) => getQualityRank(b) - getQualityRank(a));
          setSelectedStream(sorted[0]);
        } else {
          setSelectedStream(uniqueStreams[0]);
        }
      } else {
        setStreams([]);
      }
    } catch (err) {
      console.error('Failed to load streams:', err);
      setStreams([]);
    } finally {
      setLoadingStreams(false);
    }
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 0 && diffMins > -120) {
      return `Started ${Math.abs(diffMins)}m ago`;
    } else if (diffMins < 0) {
      return 'In Progress';
    } else if (diffMins < 60) {
      return `In ${diffMins}m`;
    } else if (diffHours < 24) {
      return `In ${diffHours}h ${diffMins % 60}m`;
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  };

  const getStreamTitle = (stream: Stream) => {
    let title = stream.language || `Feed ${stream.streamNo}`;
    const hasQuality = title.toLowerCase().includes('720p') ||
                       title.toLowerCase().includes('1080p') ||
                       title.toLowerCase().includes('fhd') ||
                       title.toLowerCase().includes('4k') ||
                       title.toLowerCase().includes('uhd') ||
                       title.toLowerCase().includes('hevc');

    if (stream.is4k && !hasQuality) {
      title += ' (4K)';
    } else if (stream.hd && !hasQuality) {
      title += ' (HD)';
    }
    return title;
  };

  const getQualityRank = (stream: Stream) => {
    if (stream.is4k) return 4;
    const title = (stream.language || '').toLowerCase();
    if (title.includes('4k') || title.includes('uhd') || title.includes('2160p')) return 4;
    if (title.includes('fhd') || title.includes('1080p')) return 3;
    if (title.includes('hd') || title.includes('720p') || stream.hd) return 2;
    if (title.includes('sd') || title.includes('480p') || title.includes('360p')) return 1;
    return 0;
  };

  const getSortedStreams = useCallback(() => {
    if (!sortByQuality) return streams;
    return [...streams].sort((a, b) => getQualityRank(b) - getQualityRank(a));
  }, [streams, sortByQuality]);

  const resetAllFilters = () => {
    setSelectedSport('all');
    setSearchQuery('');
    setOnly4k(false);
  };

  const isFilterActive = selectedSport !== 'all' || searchQuery.trim() !== '' || only4k;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Live sports"
      className="fixed inset-0 bg-black/95 backdrop-blur-2xl z-[100] overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="min-h-screen bg-gradient-to-b from-neutral-950 via-black to-neutral-950">
        {/* Header Bar */}
        <div className="fixed top-0 left-0 right-0 z-50 bg-black/60 backdrop-blur-2xl border-b border-white/10 pt-[env(safe-area-inset-top)]">
          <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12 py-3 sm:py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-3">
              <div className="flex items-center justify-between w-full sm:w-auto">
                {/* Left Title & Back Button */}
                <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
                  <button
                    type="button"
                    aria-label="Back"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onClose();
                    }}
                    className="p-2 sm:p-2.5 liquid-glass-pill hover:scale-105 border border-white/15 rounded-full transition-all text-neutral-300 hover:text-white cursor-pointer shadow-md"
                    title="Close Live Sports"
                  >
                    <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
                  </button>

                  <div className="flex items-center gap-2 sm:gap-3">
                    <div className="p-2 sm:p-2.5 bg-white/[0.04] border border-white/15 rounded-2xl text-red-500 shadow-lg shadow-red-600/10">
                      <Trophy className="w-5 h-5 sm:w-6 sm:h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h1 className="text-base sm:text-2xl font-black tracking-tight text-white">Live Sports</h1>
                        {activeTab === 'live' && (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-950/60 border border-red-500/40 text-red-400 text-[10px] font-bold uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                            <span>{rawMatches.length} Live</span>
                          </span>
                        )}
                      </div>
                      <p className="text-neutral-400 text-xs hidden sm:block">
                        {activeTab === 'live' ? 'Watch active broadcasts live' : `${rawMatches.length} events scheduled today`}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right Action Buttons (mobile top row) */}
                <div className="flex sm:hidden items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label="Refresh match list"
                    onClick={() => fetchMatches(true)}
                    disabled={isRefreshing || loading}
                    className="p-2 liquid-glass-pill hover:scale-105 border border-white/15 rounded-full transition-all text-neutral-300 hover:text-white cursor-pointer shadow-md disabled:opacity-50"
                    title="Refresh matches"
                  >
                    <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-red-400' : ''}`} />
                  </button>

                  <button
                    type="button"
                    aria-label="Close"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onClose();
                    }}
                    className="p-2 liquid-glass-pill hover:scale-105 border border-white/15 rounded-full transition-all text-neutral-300 hover:text-white cursor-pointer shadow-md"
                    title="Close Live Sports"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Center Instant Search Bar */}
              <div className="w-full sm:flex-1 sm:max-w-md sm:mx-6">
                <div className="relative w-full">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search matches, teams, tournaments..."
                    className="w-full pl-9 pr-8 py-2 bg-white/[0.04] hover:bg-white/[0.07] focus:bg-white/[0.09] border border-white/15 focus:border-white/40 rounded-full text-xs sm:text-sm text-white placeholder-neutral-500 transition-all outline-none shadow-inner"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      aria-label="Clear Search"
                      onClick={() => setSearchQuery('')}
                      className="p-1 text-neutral-400 hover:text-white absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Right Action Buttons (desktop) */}
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  aria-label="Refresh match list"
                  onClick={() => fetchMatches(true)}
                  disabled={isRefreshing || loading}
                  className="p-2 sm:p-2.5 liquid-glass-pill hover:scale-105 border border-white/15 rounded-full transition-all text-neutral-300 hover:text-white cursor-pointer shadow-md disabled:opacity-50"
                  title="Refresh matches"
                >
                  <RotateCw className={`w-4 h-4 sm:w-5 sm:h-5 ${isRefreshing ? 'animate-spin text-red-400' : ''}`} />
                </button>

                <button
                  type="button"
                  aria-label="Close"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                  }}
                  className="p-2 sm:p-2.5 liquid-glass-pill hover:scale-105 border border-white/15 rounded-full transition-all text-neutral-300 hover:text-white cursor-pointer shadow-md"
                  title="Close Live Sports"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="pt-28 sm:pt-24 pb-12">
          <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-12">
            {/* Active Stream Player Theater Mode */}
            {/* Active Stream Player Theater Mode */}
            {selectedMatch && (
              <div className="mb-8 animate-fade-in">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Video Player (2/3 width) */}
                  <div className="lg:col-span-2">
                    <div
                      ref={containerRef}
                      onDoubleClick={toggleFullscreen}
                      style={isFullscreen ? {
                        width: '100vw',
                        height: '100vh',
                        maxWidth: '100vw',
                        maxHeight: '100vh',
                        aspectRatio: 'auto',
                        borderRadius: '0px',
                        border: 'none',
                        zIndex: 9999,
                        position: 'fixed',
                        top: 0,
                        left: 0
                      } : undefined}
                      className="relative bg-black rounded-3xl overflow-hidden border border-white/15 shadow-2xl shadow-black/90 aspect-video flex items-center justify-center transition-all duration-300"
                    >
                      {loadingStreams ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
                          <div className="animate-spin rounded-full h-10 w-10 border-2 border-white/20 border-t-red-500" />
                          <p className="text-white font-bold text-sm sm:text-base">Connecting to Broadcast Feeds...</p>
                          <p className="text-neutral-400 text-xs max-w-sm">Fetching and prioritizing live stream sources for {selectedMatch.title}</p>
                        </div>
                      ) : !selectedStream ? (
                        <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
                          <AlertCircle className="w-12 h-12 text-amber-400 mb-3 animate-pulse" />
                          <h3 className="text-white font-bold text-base mb-1">Broadcast Feeds Not Yet Active</h3>
                          <p className="text-neutral-400 text-xs sm:text-sm mb-5 leading-relaxed">
                            Feeds for this match are currently offline. Broadcasters usually activate streaming feeds 15 to 30 minutes before match time.
                          </p>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => loadStreams(selectedMatch)}
                              className="px-4 py-2 rounded-xl liquid-btn-primary text-black text-xs font-bold transition-all hover:scale-105 cursor-pointer shadow-md flex items-center gap-1.5"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                              <span>Check Feeds Again</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedMatch(null);
                                setSelectedStream(null);
                                setStreams([]);
                              }}
                              className="px-4 py-2 rounded-xl liquid-glass-pill text-neutral-300 hover:text-white text-xs font-semibold transition-all cursor-pointer border border-white/10"
                            >
                              Close Player
                            </button>
                          </div>
                        </div>
                      ) : !selectedStream.embedUrl ? (
                        <div className="flex flex-col items-center justify-center p-6 text-center">
                          <AlertCircle className="w-12 h-12 text-red-500 mb-3 animate-pulse" />
                          <p className="text-neutral-200 font-semibold mb-1">Stream feed unavailable</p>
                          <p className="text-neutral-400 text-sm max-w-md">The source did not provide a valid streaming URL. Please try another feed.</p>
                        </div>
                      ) : selectedStream.embedUrl.includes('embed') ||
                         selectedStream.embedUrl.includes('play/') ||
                         selectedStream.embedUrl.includes('pages.dev') ||
                         selectedStream.embedUrl.includes('html') ||
                         selectedStream.embedUrl.includes('cdx-') ||
                         selectedStream.source === 'streami' ||
                         selectedStream.source === 'timstreams' ||
                         selectedStream.source === 'xyzstreams' ? (
                        <iframe
                          key={`${selectedStream.id}-${streamReloadKey}`}
                          src={selectedStream.embedUrl}
                          className="w-full h-full border-0"
                          allow="autoplay; picture-in-picture; fullscreen *"
                          allowFullScreen
                          referrerPolicy="no-referrer"
                          sandbox="allow-scripts allow-same-origin allow-presentation allow-forms"
                        />
                      ) : (
                        <video
                          key={`${selectedStream.id}-${streamReloadKey}`}
                          ref={videoRef}
                          controls
                          controlsList="nofullscreen"
                          autoPlay
                          className="w-full h-full object-contain bg-black"
                          playsInline
                        >
                          Your browser does not support the video tag.
                        </video>
                      )}

                      {/* Overlaid Top Left: Live indicator */}
                      {selectedMatch.isLive && (
                        <div
                          style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 50 }}
                          className={`flex items-center gap-2 px-3.5 py-1.5 bg-red-600/90 border border-red-400/40 backdrop-blur-md rounded-full pointer-events-none transition-opacity duration-300 shadow-[0_0_15px_rgba(239,68,68,0.5)] ${
                            showControls ? 'opacity-100' : 'opacity-0'
                          }`}
                        >
                          <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                          <span className="text-white text-xs md:text-sm font-bold tracking-wider">LIVE</span>
                        </div>
                      )}

                      {/* Overlaid Top Right Controls Group */}
                      <div
                        style={{ position: 'absolute', top: '16px', right: '16px', zIndex: 50 }}
                        className={`flex items-center gap-2 transition-opacity duration-300 ${
                          showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                        }`}
                      >
                        {/* Reload Stream Button */}
                        {selectedStream?.embedUrl && (
                          <button
                            type="button"
                            aria-label="Reload Stream"
                            onClick={() => setStreamReloadKey(k => k + 1)}
                            className="p-2.5 liquid-glass-pill bg-black/75 hover:bg-black/95 border border-white/20 text-white hover:text-red-400 backdrop-blur-xl rounded-full transition-all cursor-pointer shadow-lg hover:scale-105"
                            title="Reload Stream"
                          >
                            <RotateCw className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        )}

                        {/* Open in External Tab Button */}
                        {selectedStream?.embedUrl && (
                          <button
                            type="button"
                            aria-label="Open Stream in External Tab"
                            onClick={() => window.open(selectedStream.embedUrl, '_blank', 'noopener,noreferrer')}
                            className="p-2.5 liquid-glass-pill bg-black/75 hover:bg-black/95 border border-white/20 text-white hover:text-red-400 backdrop-blur-xl rounded-full transition-all cursor-pointer shadow-lg hover:scale-105"
                            title="Open Stream in External Tab"
                          >
                            <ExternalLink className="w-4 h-4 sm:w-5 sm:h-5" />
                          </button>
                        )}

                        {/* Fullscreen Button */}
                        {selectedStream?.embedUrl && (
                          <button
                            type="button"
                            aria-label={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                            onClick={toggleFullscreen}
                            className="p-2.5 liquid-glass-pill bg-black/75 hover:bg-black/95 border border-white/20 text-white hover:text-red-400 backdrop-blur-xl rounded-full transition-all cursor-pointer shadow-lg hover:scale-105"
                            title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                          >
                            {isFullscreen ? <Minimize className="w-4 h-4 sm:w-5 sm:h-5" /> : <Maximize className="w-4 h-4 sm:w-5 sm:h-5" />}
                          </button>
                        )}

                        {/* Close Player Button */}
                        <button
                          type="button"
                          aria-label="Close Player"
                          onClick={() => {
                            setSelectedMatch(null);
                            setSelectedStream(null);
                            setStreams([]);
                            setQualities([]);
                            setCurrentQuality(-1);
                            setIsDropdownOpen(false);
                          }}
                          className="p-2.5 liquid-glass-pill bg-black/75 hover:bg-black/95 border border-white/20 text-white hover:text-red-400 backdrop-blur-xl rounded-full transition-all cursor-pointer shadow-lg hover:scale-105"
                          title="Close Player"
                        >
                          <X className="w-4 h-4 sm:w-5 sm:h-5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Now Watching Panel (1/3 width) */}
                  <div className="lg:col-span-1">
                    <div className="liquid-glass-base border border-white/15 rounded-3xl p-5 sm:p-6 h-full shadow-2xl relative overflow-hidden flex flex-col justify-between">
                      <div className="absolute -right-16 -top-16 w-56 h-56 bg-white/[0.02] rounded-full blur-2xl pointer-events-none" />
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-4">
                          <p className="text-xs md:text-sm text-neutral-400 uppercase font-bold tracking-wider">Now Watching</p>
                          <button
                            type="button"
                            aria-label="Close Player"
                            onClick={() => {
                              setSelectedMatch(null);
                              setSelectedStream(null);
                              setStreams([]);
                              setQualities([]);
                              setCurrentQuality(-1);
                              setIsDropdownOpen(false);
                            }}
                            className="p-1.5 liquid-glass-pill border border-white/10 hover:border-white/25 rounded-full transition-all cursor-pointer text-neutral-400 hover:text-white"
                            title="Close Player"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Match Details */}
                        <div className="mb-6">
                          {selectedMatch.teams?.home && selectedMatch.teams?.away ? (
                            <div className="flex items-center justify-between mb-5 bg-white/[0.03] border border-white/10 rounded-2xl p-4 shadow-inner">
                              <div className="flex flex-col items-center flex-1 min-w-0">
                                <TeamBadge name={selectedMatch.teams.home.name} badge={selectedMatch.teams.home.badge} size="lg" />
                                <span className="text-xs text-neutral-200 text-center font-semibold truncate w-full mt-2">
                                  {selectedMatch.teams.home.name}
                                </span>
                              </div>
                              <span className="text-xs font-extrabold text-red-500 px-3 shrink-0">VS</span>
                              <div className="flex flex-col items-center flex-1 min-w-0">
                                <TeamBadge name={selectedMatch.teams.away.name} badge={selectedMatch.teams.away.badge} size="lg" />
                                <span className="text-xs text-neutral-200 text-center font-semibold truncate w-full mt-2">
                                  {selectedMatch.teams.away.name}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <h2 className="text-lg font-bold text-white mb-4 leading-snug">{selectedMatch.title}</h2>
                          )}

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5 text-neutral-300 text-xs font-semibold">
                              <SportVectorIcon sport={selectedMatch.category} className="w-4 h-4 text-neutral-400" />
                              <span className="capitalize">{selectedMatch.category}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {selectedMatch.is4k && (
                                <span className="text-[10px] bg-purple-950/70 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-500/40 font-bold uppercase tracking-wider">
                                  4K UHD
                                </span>
                              )}
                              <span className="text-[10px] bg-white/10 text-neutral-300 px-2.5 py-0.5 rounded-full border border-white/15 font-semibold">
                                {formatTime(selectedMatch.date)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Stream Selection Dropdown or State */}
                        <div className="flex flex-col gap-2 mb-4 relative z-50" ref={dropdownRef}>
                          <div className="flex items-center justify-between">
                            <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wider">Select Stream Feed</span>
                            {streams.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setSortByQuality(!sortByQuality)}
                                className={`flex items-center gap-1.5 px-3 py-1 rounded-xl text-[10px] font-semibold transition-all cursor-pointer border ${
                                  sortByQuality
                                    ? 'bg-neutral-800 text-neutral-200 border-white/20'
                                    : 'bg-white/[0.03] border-white/10 text-neutral-400 hover:text-white'
                                }`}
                              >
                                <SlidersHorizontal className="w-3 h-3 text-red-400" />
                                <span>Sort: Quality First</span>
                              </button>
                            )}
                          </div>

                          {loadingStreams ? (
                            <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/[0.04] border border-white/10 text-neutral-300 text-xs">
                              <div className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white/20 border-t-red-500 shrink-0" />
                              <span>Searching for broadcast feeds...</span>
                            </div>
                          ) : streams.length === 0 ? (
                            <div className="p-3.5 rounded-2xl bg-amber-500/[0.08] border border-amber-500/20 text-amber-200 text-xs flex flex-col gap-2">
                              <div className="flex items-center gap-1.5 font-bold">
                                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                                <span>No active feeds right now</span>
                              </div>
                              <p className="text-[11px] text-neutral-400">Streams will appear automatically as soon as coverage begins.</p>
                              <button
                                type="button"
                                onClick={() => loadStreams(selectedMatch)}
                                className="mt-1 px-3 py-1.5 rounded-xl liquid-btn-primary text-black text-[11px] font-bold self-start cursor-pointer flex items-center gap-1"
                              >
                                <RotateCw className="w-3 h-3" />
                                <span>Retry Feeds</span>
                              </button>
                            </div>
                          ) : (
                            <LiquidDropdown
                              label="Select a feed..."
                              title="Available Feeds"
                              options={getSortedStreams().map((stream) => ({
                                id: stream.id,
                                name: getStreamTitle(stream),
                                badge: (
                                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-md bg-white/[0.08] text-neutral-300 border border-white/10 uppercase tracking-wider shrink-0">
                                    {stream.source}
                                  </span>
                                ),
                              }))}
                              value={selectedStream?.id || ''}
                              onChange={(val) => {
                                const s = streams.find((st) => String(st.id) === String(val));
                                if (s) setSelectedStream(s);
                              }}
                              className="w-full"
                              menuWidth="w-full"
                            />
                          )}
                        </div>

                        {/* Direct HLS Quality Selector Buttons (when supported) */}
                        {qualities.length > 1 && (
                          <div className="mb-4">
                            <span className="text-neutral-400 text-xs font-semibold uppercase tracking-wider block mb-2">Resolution</span>
                            <div className="flex flex-wrap gap-1.5">
                              {qualities.map((q) => (
                                <button
                                  type="button"
                                  key={q.index}
                                  onClick={() => handleQualityChange(q.index)}
                                  className={`px-3 py-1 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                                    currentQuality === q.index
                                      ? 'bg-white/[0.15] text-white border-white/30 shadow-md font-bold'
                                      : 'bg-white/[0.04] border-white/10 text-neutral-400 hover:text-white'
                                  }`}
                                >
                                  {q.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Stream Troubleshooting Note */}
                        <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/10 text-neutral-400 text-[11px] leading-relaxed flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                          <span>If a stream buffers or stalls, try switching to a different feed above or click the reload icon on the video player.</span>
                        </div>
                      </div>

                      {/* Close Player Action Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMatch(null);
                          setSelectedStream(null);
                          setStreams([]);
                          setQualities([]);
                          setCurrentQuality(-1);
                          setIsDropdownOpen(false);
                        }}
                        className="w-full mt-4 py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 hover:border-red-500/40 text-neutral-300 hover:text-white text-xs md:text-sm font-semibold transition-all cursor-pointer text-center shadow-lg"
                      >
                        Close Player
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Tabs & Sport Categories Bar */}
            <div className="mb-6 space-y-4">
              {/* Top Navigation Tabs */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 flex-wrap">
                  {/* Segmented Tab Control */}
                  <div className="inline-flex p-1 rounded-2xl bg-white/[0.04] border border-white/15 backdrop-blur-xl shadow-lg gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveTab('live')}
                      className={`px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold flex items-center gap-2 transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] ${
                        activeTab === 'live'
                          ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                          : 'liquid-glass-pill text-neutral-300 hover:text-white'
                      }`}
                    >
                      <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                      <span>Live Now</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
                        activeTab === 'live' ? 'bg-white/20 text-white' : 'bg-white/10 text-neutral-400'
                      }`}>
                        {categoryCounts['all'] || rawMatches.length}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveTab('today')}
                      className={`px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold flex items-center gap-2 transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] ${
                        activeTab === 'today'
                          ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                          : 'liquid-glass-pill text-neutral-300 hover:text-white'
                      }`}
                    >
                      <Clock className="w-4 h-4 text-neutral-400" />
                      <span>Today&apos;s Schedule</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
                        activeTab === 'today' ? 'bg-white/20 text-white' : 'bg-white/10 text-neutral-400'
                      }`}>
                        {categoryCounts['all'] || rawMatches.length}
                      </span>
                    </button>
                  </div>

                  {/* 4K UHD Filter Chip */}
                  <button
                    type="button"
                    onClick={() => setOnly4k(!only4k)}
                    className={`px-4 sm:px-4.5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold flex items-center gap-2 transition-all cursor-pointer min-h-[42px] sm:min-h-[44px] ${
                      only4k
                        ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                        : 'liquid-glass-pill text-neutral-300 hover:text-white'
                    }`}
                  >
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span>4K UHD Only</span>
                    {categoryCounts['4k'] > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white font-mono font-bold ml-0.5">
                        {categoryCounts['4k']}
                      </span>
                    )}
                  </button>
                </div>

                {/* Reset Filters Action */}
                {isFilterActive && (
                  <button
                    type="button"
                    onClick={resetAllFilters}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-neutral-300 hover:text-white liquid-glass-pill rounded-xl transition-all cursor-pointer min-h-[42px]"
                  >
                    <FilterX className="w-4 h-4" />
                    <span>Clear Filters</span>
                  </button>
                )}
              </div>

              {/* Sport Category Filter Scrollpane with Navigation Arrows and Track */}
              <div className="relative group/category-scroll my-1">
                {/* Left Scroll Navigation Button with edge fade */}
                {showCategoryLeftArrow && (
                  <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center pr-4 bg-gradient-to-r from-black via-black/80 to-transparent pointer-events-none">
                    <button
                      type="button"
                      onClick={() => scrollCategories('left')}
                      aria-label="Scroll sports categories left"
                      className="p-2 liquid-orb bg-black/85 text-white border border-white/25 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all pointer-events-auto cursor-pointer"
                    >
                      <ChevronLeft className="w-4 h-4 text-white" />
                    </button>
                  </div>
                )}

                {/* Right Scroll Navigation Button with edge fade */}
                {showCategoryRightArrow && (
                  <div className="absolute right-0 top-0 bottom-0 z-20 flex items-center pl-4 bg-gradient-to-l from-black via-black/80 to-transparent pointer-events-none">
                    <button
                      type="button"
                      onClick={() => scrollCategories('right')}
                      aria-label="Scroll sports categories right"
                      className="p-2 liquid-orb bg-black/85 text-white border border-white/25 rounded-full shadow-2xl hover:scale-110 active:scale-95 transition-all pointer-events-auto cursor-pointer"
                    >
                      <ChevronRight className="w-4 h-4 text-white" />
                    </button>
                  </div>
                )}

                {/* Sport Category Filter Pills Track */}
                <div
                  ref={categoryScrollRef}
                  onWheel={handleCategoryWheel}
                  className="flex items-center gap-2.5 overflow-x-auto pb-2.5 pt-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/20 hover:scrollbar-thumb-white/40 scroll-smooth"
                >
                  {/* All Sports Pill */}
                  <button
                    type="button"
                    onClick={(e) => selectSportAndEnsureVisible('all', e)}
                    className={`group px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 shrink-0 select-none min-h-[42px] sm:min-h-[44px] ${
                      selectedSport === 'all'
                        ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                        : 'liquid-glass-pill text-neutral-300 hover:text-white'
                    }`}
                  >
                    <SportVectorIcon sport="all" className="w-4.5 h-4.5 transition-colors" />
                    <span>All Sports</span>
                    <span className={`text-xs font-mono transition-colors px-2 py-0.5 rounded-full ${
                      selectedSport === 'all' ? 'bg-white/25 text-white font-bold' : 'bg-white/10 text-neutral-400'
                    }`}>
                      {categoryCounts['all'] || rawMatches.length}
                    </span>
                  </button>

                  {/* Individual Sport Pills with Vector SVG Icons */}
                  {sports.map(sport => {
                    const count = categoryCounts[sport.id.toLowerCase()] || 0;
                    const isSelected = selectedSport === sport.id;

                    return (
                      <button
                        type="button"
                        key={sport.id}
                        onClick={(e) => selectSportAndEnsureVisible(sport.id, e)}
                        className={`group px-4.5 sm:px-5 py-2 sm:py-2.5 rounded-xl text-sm sm:text-base font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 shrink-0 select-none min-h-[42px] sm:min-h-[44px] ${
                          isSelected
                            ? 'liquid-glass-pill-active font-bold shadow-md text-white border-white/40'
                            : 'liquid-glass-pill text-neutral-300 hover:text-white'
                        }`}
                      >
                        <SportVectorIcon sport={sport.id} className="w-4.5 h-4.5 transition-colors" />
                        <span>{sport.name}</span>
                        <span className={`text-xs font-mono transition-colors px-2 py-0.5 rounded-full ${
                          isSelected
                            ? 'bg-white/25 text-white font-bold'
                            : count > 0
                            ? 'bg-white/10 text-neutral-400'
                            : 'bg-white/5 text-neutral-500'
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Matches Grid / Loading / Error / Empty States */}
            {loading ? (
              /* Shimmering Skeleton Grid */
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[2/3] rounded-2xl bg-white/[0.03] border border-white/10 animate-pulse overflow-hidden relative flex flex-col justify-between p-3.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="w-14 h-5 rounded-full bg-white/10" />
                      <div className="w-16 h-5 rounded-md bg-white/10" />
                    </div>
                    <div className="space-y-2">
                      <div className="w-3/4 h-4 rounded bg-white/10" />
                      <div className="w-1/2 h-3 rounded bg-white/10" />
                    </div>
                  </div>
                ))}
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center h-64 text-neutral-400 liquid-glass-base border border-white/10 rounded-3xl p-8">
                <AlertCircle className="w-12 h-12 mb-4 text-red-500" />
                <p className="text-white font-semibold">{error}</p>
                <p className="text-sm mt-2 text-neutral-400 mb-4">Failed to load sports matches</p>
                <button
                  type="button"
                  onClick={() => fetchMatches(false)}
                  className="px-6 py-2.5 rounded-xl liquid-btn-primary text-black text-sm font-bold transition-all hover:scale-105 cursor-pointer shadow-md"
                >
                  Try Again
                </button>
              </div>
            ) : filteredMatches.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-neutral-400 liquid-glass-base border border-white/10 rounded-3xl p-8 text-center max-w-lg mx-auto">
                <Trophy className="w-12 h-12 mb-3 text-neutral-500" />
                <p className="text-white font-semibold text-lg">
                  {searchQuery
                    ? `No matches found matching "${searchQuery}"`
                    : selectedSport !== 'all'
                    ? `No ${activeTab === 'live' ? 'live' : 'scheduled'} ${selectedSport} matches right now`
                    : `No ${activeTab === 'live' ? 'live' : 'scheduled'} matches found`}
                </p>
                <p className="text-sm mt-2 text-neutral-400 mb-5">
                  {activeTab === 'live'
                    ? 'Matches will appear here as soon as broadcasts begin. Check today\'s schedule for upcoming games.'
                    : 'Try selecting a different sport or clearing your search filters.'}
                </p>
                <div className="flex items-center gap-3">
                  {activeTab === 'live' && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('today')}
                      className="px-5 py-2.5 rounded-xl liquid-btn-primary text-black text-sm font-bold transition-all hover:scale-105 cursor-pointer shadow-md"
                    >
                      View Today&apos;s Schedule
                    </button>
                  )}
                  {isFilterActive && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="px-5 py-2.5 rounded-xl liquid-btn-secondary text-white text-sm font-semibold transition-all hover:scale-105 cursor-pointer shadow-md"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
                {filteredMatches.map(match => (
                  <SportCard
                    key={match.id}
                    match={match}
                    isSelected={selectedMatch?.id === match.id}
                    isLoadingStream={loadingStreams && selectedMatch?.id === match.id}
                    onWatch={() => loadStreams(match)}
                    formatTime={formatTime}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
