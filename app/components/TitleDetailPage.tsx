'use client';

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Plus,
  Check,
  Download,
  Film,
  Globe,
  Sparkles,
  Eye,
  EyeOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Star,
  Tv,
  Loader2,
  MoreVertical,
  Trash2,
  DownloadCloud,
  Grid3X3,
  ArrowUpDown,
  X,
  PlayCircle,
  BellRing,
  BellOff,
  User,
  BookmarkMinus,
  Info,
  SkipForward
} from 'lucide-react';
import StreamServerModal from './StreamServerModal';
import DownloadModal from './DownloadModal';
import TrailerModal from './TrailerModal';
import FixMatchModal from './FixMatchModal';
import ContentCard, { type ContentItem as DiscoverContentCardItem } from './ContentCard';
import RottenTomatoesIcon from './RottenTomatoesIcon';
import TMDBImage from './TMDBImage';
import LiquidDropdown from './LiquidDropdown';
import { triggerHaptic } from '@/lib/haptics';
import { cachedFetch } from '@/lib/clientQueryCache';
import { useToast } from '@/app/hooks/useToast';
import ToastNotification from './ToastNotification';
const MIN_EPISODE_VOTES = 10;

const QUALITY_OPTIONS = [
  { id: 'best', name: 'Best Available' },
  { id: '2160p', name: '4K / 2160p' },
  { id: '1080p', name: '1080p' },
  { id: '720p', name: '720p' },
  { id: 'any', name: 'Fallback (Any)' },
];

const PERSON_SORT_OPTIONS = [
  { id: 'date', name: 'Sort: Date' },
  { id: 'rating', name: 'Sort: Rating' },
  { id: 'popular', name: 'Sort: Popular' },
];

type PersonCredit = {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  rating: number | null;
  imdbRating?: number | null;
  year: string | null;
  popularity: number;
  character: string | null;
};

type PersonDetails = {
  id: number;
  name: string;
  profilePath: string | null;
  biography: string | null;
  credits: PersonCredit[];
};

type PersonCreditFilter = 'all' | 'movie' | 'tv';
type PersonCreditSort = 'date' | 'rating' | 'popular';

const personCreditFilters: { value: PersonCreditFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV Shows' },
];

type AutoTrackEntry = {
  showId: number;
  enabled: number;
  qualityPreference: string;
  target?: string;
};

export type ContentItem = {
  id: number;
  tmdbId?: number | null;
  type: 'movie' | 'show';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  genres?: string | null;
  language?: string | null;
  year?: number;
  firstAirDate?: string | null;
  rating: number | null;
  imdbRating?: number | null;
  isHDR?: boolean;
  resolution?: string | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  audioChannels?: string | null;
  filePath?: string;
  addedAt?: string;
  watchProgress?: {
    progress: number;
    duration: number;
    completed: number;
  };
};

export type Episode = {
  id: number;
  showId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  filePath?: string;
  overview?: string | null;
  stillPath?: string | null;
  rating?: number | null;
  voteCount?: number | null;
  imdbRating?: number | null;
  isHDR?: boolean;
  resolution?: string | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  audioChannels?: string | null;
  airDate?: string | null;
  runtime?: number | null;
  watchProgress?: {
    progress: number;
    duration: number;
    completed: number;
  };
};

export type SeasonGroup = {
  season: number;
  episodes: Episode[];
};

type TmdbCast = {
  id: number;
  name: string;
  character: string;
  profilePath: string | null;
};

type TmdbMovieDetails = {
  overview: string | null;
  tagline: string | null;
  genres: string;
  runtime: number | null;
  releaseDate?: string | null;
  status?: string | null;
  logoPath: string | null;
  collection: {
    id: number;
    name: string;
    posterPath: string | null;
    backdropPath: string | null;
  } | null;
  cast: TmdbCast[];
  productionCompanies?: { id: number; name: string; logoPath: string | null }[];
};

type TmdbTvDetails = {
  overview: string | null;
  tagline: string | null;
  genres: string;
  status: string | null;
  firstAirDate?: string | null;
  lastAirDate?: string | null;
  numberOfSeasons: number;
  logoPath: string | null;
  seasons: {
    seasonNumber: number;
    name: string;
    episodeCount: number;
    posterPath: string | null;
    airDate: string | null;
  }[];
  cast: TmdbCast[];
  networks?: { id: number; name: string; logoPath: string | null }[];
};

type CollectionData = {
  id: number;
  name: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  parts: {
    tmdbId: number;
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    rating: number | null;
    imdbRating?: number | null;
    year: string | null;
    releaseDate: string | null;
  }[];
};

type TrailerData = {
  key: string;
  name: string;
  site: string;
  type: string;
};

type SimilarItem = {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  rating: number | null;
  imdbRating?: number | null;
  year: string | null;
  popularity: number;
};

type Props = {
  item: ContentItem;
  isLocal?: boolean;
  initialSection?: 'top' | 'episodes';
  onBack: () => void;
  onPlayLocal?: (item: ContentItem, episodeId?: number, startTime?: number) => void;
  onDeleteEpisode?: (episodeId: number) => void;
  onRemoveEpisodeFromLibrary?: (episodeId: number) => void;
  onMarkWatched?: (item: ContentItem, watched: boolean, episodeId?: number) => void;
  onFixMatch?: (item: ContentItem) => void;
  onOpenOnline?: (item: {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    rating: number | null;
    imdbRating?: number | null;
    year: string | null;
    popularity: number;
  }) => void;
  onSelectSimilar?: (similar: SimilarItem) => void;
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function calculateEndTime(runtimeMinutes: number): string {
  const now = new Date();
  now.setMinutes(now.getMinutes() + runtimeMinutes);
  return now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function episodeScore(
  imdbRating?: number | null,
  rating?: number | null,
  voteCount?: number | null
): { value: number; source: 'IMDb' | 'TMDB' } | null {
  if (imdbRating != null && imdbRating > 0) return { value: imdbRating, source: 'IMDb' };
  if (rating == null || rating <= 0) return null;
  if (voteCount != null && voteCount < MIN_EPISODE_VOTES) return null;
  return { value: rating, source: 'TMDB' };
}

function getMediaTags(target: {
  resolution?: string | null;
  isHDR?: boolean | number;
  filePath?: string;
  videoCodec?: string | null;
  audioCodec?: string | null;
  audioChannels?: string | null;
  language?: string | null;
}): { label: string; cls: string }[] {
  const tags: { label: string; cls: string }[] = [];
  const fp = (target.filePath || '').toUpperCase();
  if (target.resolution) {
    tags.push({
      label: target.resolution === '2160p' ? '4K' : target.resolution,
      cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
    });
  }
  if (target.isHDR || /\bHDR\b/.test(fp)) {
    tags.push({
      label: /HDR10\+|HDR10PLUS/.test(fp) ? 'HDR10+' : /HDR10/.test(fp) ? 'HDR10' : 'HDR',
      cls: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
    });
  } else if (target.resolution) {
    tags.push({
      label: 'SDR',
      cls: 'bg-neutral-600/40 text-neutral-300 border border-neutral-600/40'
    });
  }
  if (/\bDOVI\b|\bDV\b|DOLBY.?VISION/.test(fp)) {
    tags.push({ label: 'DV', cls: 'bg-fuchsia-500/90 text-white font-bold' });
  }
  if (/\bIMAX\b/.test(fp)) {
    tags.push({ label: 'IMAX', cls: 'bg-cyan-500/90 text-black font-bold' });
  }
  if (/\bREMUX\b/.test(fp)) {
    tags.push({ label: 'Remux', cls: 'bg-emerald-500/90 text-black font-bold' });
  }
  if (/\bATMOS\b/.test(fp)) {
    tags.push({ label: 'Atmos', cls: 'bg-indigo-500/90 text-white font-bold' });
  }
  if (/\bDTS[\s.-]?HD/.test(fp)) {
    tags.push({ label: 'DTS-HD', cls: 'bg-sky-500/80 text-white font-bold' });
  }
  if (/\bTRUEHD\b|\bTRUE[\s.-]?HD/.test(fp)) {
    tags.push({ label: 'TrueHD', cls: 'bg-sky-500/80 text-white font-bold' });
  }
  if (target.videoCodec) {
    tags.push({
      label: target.videoCodec.toUpperCase(),
      cls: 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
    });
  }
  if (target.audioCodec) {
    tags.push({
      label: target.audioCodec.toUpperCase(),
      cls: 'bg-teal-500/20 text-teal-300 border border-teal-500/40'
    });
  }
  if (target.audioChannels) {
    tags.push({
      label: target.audioChannels,
      cls: 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
    });
  }
  if (target.language && target.language !== 'English') {
    tags.push({
      label: target.language,
      cls: 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
    });
  }
  return tags;
}

type CollectionPartItem = CollectionData['parts'][0];

function CollectionPartCard({
  part,
  isCurrent,
  onOpen,
}: {
  part: CollectionPartItem;
  isCurrent: boolean;
  isLast?: boolean;
  onOpen: (part: CollectionPartItem) => void;
}) {
  const handleClick = useCallback(() => {
    if (!isCurrent) {
      onOpen(part);
    }
  }, [isCurrent, onOpen, part]);

  return (
    <div
      onClick={handleClick}
      className={`w-28 sm:w-32 md:w-36 flex-none relative transition-all duration-200 group/part ${
        !isCurrent ? 'cursor-pointer' : ''
      }`}
    >
      <div className={`relative rounded-2xl overflow-hidden ${isCurrent ? 'ring-1 ring-blue-400/60 shadow-[0_0_12px_rgba(59,130,246,0.3)]' : ''}`}>
        <ContentCard
          item={{
            id: part.tmdbId,
            type: 'movie',
            title: part.title,
            posterPath: part.posterPath,
            backdropPath: part.backdropPath,
            overview: part.overview,
            rating: part.rating,
            imdbRating: part.imdbRating,
            year: part.year ? parseInt(part.year, 10) : undefined,
          }}
          onClick={handleClick}
          disableHoverExpand={true}
          showProgress={false}
          showTitle={true}
          showRating={true}
        />
        {isCurrent && (
          <div className="absolute top-2 right-2 z-20 pointer-events-none">
            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-md bg-blue-600/90 text-white shadow-sm border border-blue-400/40">
              Current
            </span>
          </div>
        )}
      </div>
      <span className="text-xs font-semibold text-white/80 line-clamp-1 mt-1.5 block group-hover/part:text-white transition-colors">
        {part.title}
      </span>
    </div>
  );
}

export default function TitleDetailPage({
  item,
  isLocal: isLocalProp,
  initialSection = 'top',
  onBack,
  onPlayLocal,
  onDeleteEpisode,
  onRemoveEpisodeFromLibrary,
  onMarkWatched,
  onFixMatch,
  onOpenOnline,
  onSelectSimilar
}: Props) {
  const router = useRouter();
  const { toast, showToast } = useToast();
  const mediaType = item.type === 'show' ? 'tv' : 'movie';
  const tmdbId = item.tmdbId;
  const isLocal = isLocalProp ?? Boolean(item.filePath || item.addedAt);
  const displayRating = item.imdbRating ?? item.rating;
  const displayRatingSource = item.imdbRating != null ? 'IMDb' : 'TMDB';

  const handleOpenDiscover = useCallback((target: {
    tmdbId: number;
    mediaType: 'movie' | 'tv';
    title: string;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    rating: number | null;
    imdbRating?: number | null;
    year?: string | number | null;
    popularity?: number;
  }) => {
    triggerHaptic('light');
    const onlinePayload = {
      tmdbId: target.tmdbId,
      mediaType: target.mediaType,
      title: target.title,
      posterPath: target.posterPath,
      backdropPath: target.backdropPath,
      overview: target.overview,
      rating: target.rating,
      imdbRating: target.imdbRating,
      year: target.year ? String(target.year) : null,
      popularity: target.popularity || 0,
    };
    if (onOpenOnline) {
      onOpenOnline(onlinePayload);
    } else if (onSelectSimilar) {
      onSelectSimilar(onlinePayload);
    } else {
      router.push(`/discover/${target.mediaType}/${target.tmdbId}`);
    }
  }, [onOpenOnline, onSelectSimilar, router]);

  // TMDB Metadata states
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [movieDetails, setMovieDetails] = useState<TmdbMovieDetails | null>(null);
  const [tvDetails, setTVDetails] = useState<TmdbTvDetails | null>(null);
  const [collectionData, setCollectionData] = useState<CollectionData | null>(null);
  const [similarItems, setSimilarItems] = useState<SimilarItem[]>([]);
  const [trailer, setTrailer] = useState<TrailerData | null>(null);

  // Background trailer video controls
  const [heroMuted, setHeroMuted] = useState(true);
  const [heroPaused, setHeroPaused] = useState(false);

  // TV Episodes states
  const [seasons, setSeasons] = useState<SeasonGroup[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [activeSeason, setActiveSeason] = useState<number>(1);
  const [seasonDropdownOpen, setSeasonDropdownOpen] = useState(false);
  const [episodesSortOrder, setEpisodesSortOrder] = useState<'oldest' | 'newest'>('oldest');
  const [showRatingsGrid, setShowRatingsGrid] = useState(false);
  const [isDownloadingMissing, setIsDownloadingMissing] = useState(false);
  const [isDownloadingNext, setIsDownloadingNext] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState<'local' | 'gdrive' | 'cloud'>('local');

  // Auto-track state (TV shows only)
  const [isTracking, setIsTracking] = useState(false);
  const [trackLoading, setTrackLoading] = useState(false);
  const [qualityPref, setQualityPref] = useState('best');
  const [targetPref, setTargetPref] = useState('local');
  const [gdriveAvailable, setGdriveAvailable] = useState(false);
  const [cloudAvailable, setCloudAvailable] = useState(false);

  const DESTINATION_OPTIONS = useMemo(() => {
    const opts = [
      { id: 'local', name: 'Local Disk' },
      { id: 'gdrive', name: 'Google Drive' },
    ];
    if (cloudAvailable) {
      opts.push({ id: 'cloud', name: 'Cloud Worker' });
    }
    return opts;
  }, [cloudAvailable]);

  // Person / Cast details modal state
  const [personModalOpen, setPersonModalOpen] = useState(false);
  const [personData, setPersonData] = useState<PersonDetails | null>(null);
  const [loadingPerson, setLoadingPerson] = useState(false);
  const [visiblePersonCredits, setVisiblePersonCredits] = useState(8);
  const [personCreditFilter, setPersonCreditFilter] = useState<PersonCreditFilter>('all');
  const [personCreditSort, setPersonCreditSort] = useState<PersonCreditSort>('date');

  // Episode detail preview modal state
  const [selectedEpisodePreview, setSelectedEpisodePreview] = useState<Episode | null>(null);

  // Modals
  const [showStreamModal, setShowStreamModal] = useState(false);
  const [streamModalTarget, setStreamModalTarget] = useState<{ season?: number; episode?: number } | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [showTrailerModal, setShowTrailerModal] = useState(false);
  const [showFixMatch, setShowFixMatch] = useState(false);

  // Watchlist state
  const [isInWatchlist, setIsInWatchlist] = useState(false);
  const [watchlistItemId, setWatchlistItemId] = useState<number | null>(null);
  const [watchlistBusy, setWatchlistBusy] = useState(false);

  // Episode context menu
  const [activeContextMenu, setActiveContextMenu] = useState<{ x: number; y: number; episode: Episode } | null>(null);

  const filteredPersonCredits = useMemo(() => {
    const credits = personData?.credits || [];
    const filtered = personCreditFilter === 'all'
      ? credits
      : credits.filter((credit) => credit.mediaType === personCreditFilter);

    const getYearVal = (c: PersonCredit) => {
      const y = parseInt(c.year || '0', 10);
      return Number.isFinite(y) ? y : 0;
    };

    return [...filtered].sort((a, b) => {
      if (personCreditSort === 'rating') {
        const ratingDiff = (b.rating || 0) - (a.rating || 0);
        if (ratingDiff !== 0) return ratingDiff;
      } else if (personCreditSort === 'popular') {
        const popularityDiff = (b.popularity || 0) - (a.popularity || 0);
        if (popularityDiff !== 0) return popularityDiff;
      } else {
        const yearDiff = getYearVal(b) - getYearVal(a);
        if (yearDiff !== 0) return yearDiff;
      }

      const fallbackYearDiff = getYearVal(b) - getYearVal(a);
      if (fallbackYearDiff !== 0) return fallbackYearDiff;
      return (b.popularity || 0) - (a.popularity || 0);
    });
  }, [personCreditFilter, personCreditSort, personData]);

  // Check if show is being tracked and fetch destination settings
  const checkTrackingStatus = useCallback(async () => {
    if (item.type !== 'show' || !item.tmdbId) return;
    try {
      const [trackRes, settingsRes] = await Promise.all([
        fetch('/api/auto-track'),
        fetch('/api/settings').catch(() => null)
      ]);

      let globalTarget: 'local' | 'gdrive' | 'cloud' = 'local';
      if (settingsRes && settingsRes.ok) {
        const s = await settingsRes.json();
        if (s.gdriveEnabled === 'true' || s.gdriveRemote || s.gdriveMountDrive) {
          setGdriveAvailable(true);
        }
        if (s.cloudEnabled === 'true' || s.cloudWorkerUrl) {
          setCloudAvailable(true);
        }
        if (s.autoDownloadTarget && ['local', 'gdrive', 'cloud'].includes(s.autoDownloadTarget)) {
          globalTarget = s.autoDownloadTarget;
        }
      }

      if (trackRes && trackRes.ok) {
        const data = await trackRes.json();
        const tracked = ((data.tracked || []) as AutoTrackEntry[]).find((t) => t.showId === item.id);
        if (tracked) {
          setIsTracking(!!tracked.enabled);
          setQualityPref(tracked.qualityPreference || 'best');
          const t = (tracked.target && ['local', 'gdrive', 'cloud'].includes(tracked.target))
            ? (tracked.target as 'local' | 'gdrive' | 'cloud')
            : globalTarget;
          setTargetPref(t);
          setDownloadTarget(t);
        } else {
          setIsTracking(false);
          setTargetPref(globalTarget);
          setDownloadTarget(globalTarget);
        }
      } else {
        setDownloadTarget(globalTarget);
      }
    } catch { /* ignore */ }
  }, [item.id, item.type, item.tmdbId]);

  useEffect(() => {
    checkTrackingStatus();
  }, [checkTrackingStatus]);

  // Scroll handling based on initialSection prop
  useEffect(() => {
    if (initialSection === 'episodes' && item.type === 'show') {
      const scrollToEpisodes = () => {
        const el = document.getElementById('episodes-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
      scrollToEpisodes();
      const t1 = setTimeout(scrollToEpisodes, 100);
      const t2 = setTimeout(scrollToEpisodes, 300);
      const t3 = setTimeout(scrollToEpisodes, 600);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    } else {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [item.id, initialSection, item.type]);

  const toggleTracking = async () => {
    if (!item.tmdbId) return;
    setTrackLoading(true);
    triggerHaptic('light');
    try {
      if (isTracking) {
        await fetch(`/api/auto-track?showId=${item.id}`, { method: 'DELETE' });
        setIsTracking(false);
        showToast('Auto-tracking stopped', 'success');
      } else {
        await fetch('/api/auto-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            showId: item.id,
            qualityPreference: qualityPref,
            target: targetPref
          })
        });
        setIsTracking(true);
        showToast('Auto-tracking active', 'success');
      }
    } catch {
      showToast('Failed to update tracking', 'error');
    } finally {
      setTrackLoading(false);
    }
  };

  const updateQualityPref = async (newQuality: string) => {
    setQualityPref(newQuality);
    triggerHaptic('light');
    try {
      await fetch('/api/auto-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId: item.id,
          qualityPreference: newQuality,
          target: targetPref
        })
      });
      showToast(`Preferred quality set to ${newQuality}`, 'success');
    } catch {
      showToast('Failed to update quality preference', 'error');
    }
  };

  const updateTargetPref = async (newTarget: string) => {
    setTargetPref(newTarget);
    if (['local', 'gdrive', 'cloud'].includes(newTarget)) {
      setDownloadTarget(newTarget as any);
    }
    triggerHaptic('light');
    try {
      await fetch('/api/auto-track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId: item.id,
          qualityPreference: qualityPref,
          target: newTarget
        })
      });
      showToast(`Destination set to ${newTarget}`, 'success');
    } catch {
      showToast('Failed to update destination', 'error');
    }
  };

  const handleDownloadNext = async () => {
    if (!item.id) return;
    setIsDownloadingNext(true);
    triggerHaptic('light');
    try {
      const res = await fetch(`/api/episodes/next?showId=${item.id}&autoDownload=true&target=${downloadTarget}`);
      const data = await res.json();
      if (res.ok && data.queued) {
        showToast(data.message || 'Next episode download queued', 'success');
      } else {
        showToast(data.error || 'Failed to queue next episode download', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || 'Network error queueing next episode', 'error');
    } finally {
      setIsDownloadingNext(false);
    }
  };

  const handlePersonClick = async (personId: number) => {
    triggerHaptic('light');
    setPersonModalOpen(true);
    setLoadingPerson(true);
    setPersonData(null);
    setVisiblePersonCredits(8);
    try {
      const res = await fetch(`/api/tmdb-person?id=${personId}`);
      if (res.ok) {
        const data = await res.json();
        setPersonData(data);
      }
    } catch (err) {
      console.error('Failed to load person data:', err);
    } finally {
      setLoadingPerson(false);
    }
  };

  // Scroll ref for horizontal episode carousel
  const episodeTrackRef = useRef<HTMLDivElement>(null);
  const castTrackRef = useRef<HTMLDivElement>(null);
  const collectionTrackRef = useRef<HTMLDivElement>(null);
  const seasonDropdownRef = useRef<HTMLDivElement>(null);

  // Close season dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (seasonDropdownRef.current && !seasonDropdownRef.current.contains(e.target as Node)) {
        setSeasonDropdownOpen(false);
      }
      setActiveContextMenu(null);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Fetch TMDB details, collection, similar, and trailer
  useEffect(() => {
    let cancelled = false;

    const fetchTmdbData = async () => {
      if (!tmdbId) return;
      setLoadingDetails(true);

      try {
        const [detailsResp, similarResp, trailerResp] = await Promise.allSettled([
          cachedFetch<any>(`/api/tmdb-details?id=${tmdbId}&type=${mediaType}`),
          cachedFetch<any>(`/api/tmdb-similar?id=${tmdbId}&type=${mediaType}`),
          cachedFetch<any>(`/api/trailer?title=${encodeURIComponent(item.title)}&year=${item.year || ''}`),
        ]);

        if (cancelled) return;

        if (detailsResp.status === 'fulfilled' && detailsResp.value) {
          const data = detailsResp.value;
          if (mediaType === 'movie') {
            const m = data as TmdbMovieDetails;
            setMovieDetails(m);
            if (m.collection?.id) {
              cachedFetch<CollectionData>(`/api/tmdb-collection?id=${m.collection.id}`)
                .then((c) => { if (!cancelled) setCollectionData(c); })
                .catch(() => {});
            }
          } else {
            const t = data as TmdbTvDetails;
            setTVDetails(t);
            if (t.seasons && t.seasons.length > 0) {
              const firstValid = t.seasons.find((s) => s.seasonNumber > 0) || t.seasons[0];
              if (firstValid) setActiveSeason(firstValid.seasonNumber);
            }
          }
        }

        if (similarResp.status === 'fulfilled' && similarResp.value) {
          const simVal = similarResp.value;
          const results = Array.isArray(simVal) ? simVal : (simVal.results || []);
          const filtered = results.filter((s: SimilarItem) => s.tmdbId !== tmdbId);
          setSimilarItems(filtered);
        }

        if (trailerResp.status === 'fulfilled' && trailerResp.value?.key) {
          setTrailer(trailerResp.value);
        }
      } catch (err) {
        console.error('Failed to fetch TMDB details:', err);
      } finally {
        if (!cancelled) setLoadingDetails(false);
      }
    };

    fetchTmdbData();

    return () => {
      cancelled = true;
    };
  }, [tmdbId, mediaType, item.title, item.year]);

  // Fetch local episodes for TV shows
  useEffect(() => {
    if (item.type !== 'show') return;

    let cancelled = false;
    setLoadingEpisodes(true);

    const fetchEpisodes = async () => {
      try {
        const res = await fetch(`/api/episodes?showId=${item.id}`);
        if (!res.ok) throw new Error('Failed to fetch episodes');
        const data = await res.json();
        if (cancelled) return;

        const loadedSeasons = (data.seasons || []) as SeasonGroup[];
        setSeasons(loadedSeasons);
        if (loadedSeasons.length > 0) {
          setActiveSeason(loadedSeasons[0].season);
        }
      } catch (err) {
        console.error('Error fetching episodes:', err);
      } finally {
        if (!cancelled) setLoadingEpisodes(false);
      }
    };

    fetchEpisodes();

    return () => {
      cancelled = true;
    };
  }, [item.id, item.type]);

  // Check Watchlist status
  useEffect(() => {
    if (isLocal || !tmdbId) return;
    let cancelled = false;

    const checkWatchlist = async () => {
      try {
        const res = await fetch('/api/watchlist');
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        const found = (data || []).find((w: any) => w.tmdbId === tmdbId);
        if (found) {
          setIsInWatchlist(true);
          setWatchlistItemId(found.id);
        } else {
          setIsInWatchlist(false);
          setWatchlistItemId(null);
        }
      } catch {}
    };

    checkWatchlist();

    return () => {
      cancelled = true;
    };
  }, [tmdbId]);

  const toggleWatchlist = async () => {
    if (!tmdbId || watchlistBusy) return;
    setWatchlistBusy(true);
    triggerHaptic('light');

    try {
      if (isInWatchlist && watchlistItemId) {
        const res = await fetch(`/api/watchlist?id=${watchlistItemId}`, { method: 'DELETE' });
        if (res.ok) {
          setIsInWatchlist(false);
          setWatchlistItemId(null);
          showToast('Removed from Watchlist', 'success');
        }
      } else {
        const res = await fetch('/api/watchlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tmdbId,
            mediaType,
            title: item.title,
            posterPath: item.posterPath,
            backdropPath: item.backdropPath,
            overview: item.overview,
            rating: item.rating,
            imdbRating: item.imdbRating,
            year: item.year?.toString() || ''
          })
        });
        if (res.ok) {
          const data = await res.json();
          setIsInWatchlist(true);
          setWatchlistItemId(data.id);
          showToast('Added to Watchlist', 'success');
        }
      }
    } catch {
      showToast('Watchlist update failed', 'error');
    } finally {
      setWatchlistBusy(false);
    }
  };

  const activeDetails = mediaType === 'movie' ? movieDetails : tvDetails;
  const logoUrl = activeDetails?.logoPath
    ? `https://image.tmdb.org/t/p/w500${activeDetails.logoPath}`
    : null;

  const backdropUrl = item.backdropPath
    ? (item.backdropPath.startsWith('/') && !item.backdropPath.startsWith('/http')
        ? `https://image.tmdb.org/t/p/original${item.backdropPath}`
        : item.backdropPath)
    : (item.posterPath ? `https://image.tmdb.org/t/p/original${item.posterPath}` : null);

  const ambientGlowUrl = item.backdropPath
    ? `https://image.tmdb.org/t/p/w780${item.backdropPath}`
    : backdropUrl;

  const genreList = useMemo(() => {
    const raw = activeDetails?.genres || item.genres || '';
    return raw.split(',').map((g) => g.trim()).filter(Boolean);
  }, [activeDetails?.genres, item.genres]);

  const castList = useMemo(() => {
    return activeDetails?.cast?.slice(0, 16) || [];
  }, [activeDetails?.cast]);

  // Active season episodes
  const currentSeasonGroup = useMemo(() => {
    return seasons.find((s) => s.season === activeSeason) || null;
  }, [seasons, activeSeason]);

  const sortedEpisodes = useMemo(() => {
    const list = [...(currentSeasonGroup?.episodes || [])];
    if (episodesSortOrder === 'newest') {
      return list.sort((a, b) => b.episodeNumber - a.episodeNumber);
    }
    return list.sort((a, b) => a.episodeNumber - b.episodeNumber);
  }, [currentSeasonGroup?.episodes, episodesSortOrder]);

  // Overall season list (merging TMDB seasons metadata if available)
  const availableSeasons = useMemo(() => {
    if (tvDetails?.seasons?.length) {
      return tvDetails.seasons.filter((s) => s.seasonNumber > 0);
    }
    if (seasons.length > 0) {
      return seasons.map((s) => ({
        seasonNumber: s.season,
        name: `Season ${s.season}`,
        episodeCount: s.episodes.length,
        posterPath: null,
        airDate: null
      }));
    }
    return [{ seasonNumber: 1, name: 'Season 1', episodeCount: 1, posterPath: null, airDate: null }];
  }, [tvDetails?.seasons, seasons]);

  // Dynamic local runtime & end time
  const runtimeMinutes = movieDetails?.runtime || (item.watchProgress?.duration ? Math.round(item.watchProgress.duration / 60) : 0);
  const formattedRuntime = runtimeMinutes > 0 ? formatDuration(runtimeMinutes * 60) : null;
  const dynamicEndTime = runtimeMinutes > 0 ? calculateEndTime(runtimeMinutes) : null;

  // Next playable episode for TV show
  const nextPlayableEpisode = useMemo(() => {
    if (item.type !== 'show' || seasons.length === 0) return null;
    for (const s of seasons) {
      for (const ep of s.episodes) {
        if (!ep.watchProgress || ep.watchProgress.completed === 0) {
          return ep;
        }
      }
    }
    return seasons[0]?.episodes[0] || null;
  }, [item.type, seasons]);

  // Handle Play Action
  const handlePrimaryPlay = async () => {
    triggerHaptic('medium');
    if (item.type === 'movie') {
      if (onPlayLocal) {
        onPlayLocal(item, undefined, item.watchProgress?.progress);
      } else {
        setStreamModalTarget({});
        setShowStreamModal(true);
      }
    } else {
      if (nextPlayableEpisode && onPlayLocal) {
        onPlayLocal(item, nextPlayableEpisode.id, nextPlayableEpisode.watchProgress?.progress);
      } else if (seasons.length > 0 && seasons[0]?.episodes[0] && onPlayLocal) {
        onPlayLocal(item, seasons[0].episodes[0].id, seasons[0].episodes[0].watchProgress?.progress);
      } else if (onPlayLocal) {
        try {
          const res = await fetch(`/api/episodes?showId=${item.id}`);
          if (res.ok) {
            const data = await res.json();
            const loaded = (data.seasons || []) as SeasonGroup[];
            if (loaded.length > 0 && loaded[0]?.episodes[0]) {
              const ep = loaded[0].episodes[0];
              onPlayLocal(item, ep.id, ep.watchProgress?.progress);
              return;
            }
          }
        } catch { /* ignore */ }
        showToast('No local episodes found for this show', 'error');
      } else {
        setStreamModalTarget({ season: activeSeason, episode: 1 });
        setShowStreamModal(true);
      }
    }
  };

  const handleEpisodePlay = (ep: Episode) => {
    triggerHaptic('light');
    if (onPlayLocal) {
      onPlayLocal(item, ep.id, ep.watchProgress?.progress);
    } else {
      setStreamModalTarget({ season: ep.seasonNumber, episode: ep.episodeNumber });
      setShowStreamModal(true);
    }
  };

  // Scroll helpers
  const scrollTrack = (ref: React.RefObject<HTMLDivElement | null>, direction: 'left' | 'right') => {
    if (!ref.current) return;
    const offset = direction === 'left' ? -ref.current.clientWidth * 0.75 : ref.current.clientWidth * 0.75;
    ref.current.scrollBy({ left: offset, behavior: 'smooth' });
  };

  // Auto download missing episodes in active season
  const handleDownloadMissing = async () => {
    if (!item.tmdbId) return;
    setIsDownloadingMissing(true);
    triggerHaptic('light');
    try {
      const res = await fetch('/api/auto-download/season', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          showId: item.id,
          tmdbId: item.tmdbId,
          seasonNumber: activeSeason,
          target: downloadTarget
        })
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Queued missing episodes for download', 'success');
      } else {
        showToast(data.error || 'Failed to fetch missing episodes', 'error');
      }
    } catch {
      showToast('Network error fetching missing episodes', 'error');
    } finally {
      setTimeout(() => setIsDownloadingMissing(false), 800);
    }
  };

  const trailerEmbedUrl = trailer?.key
    ? `https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1&mute=${heroMuted ? '1' : '0'}&controls=0&loop=1&playlist=${trailer.key}`
    : null;

  return (
    <div className="relative min-h-screen w-full bg-[#050505] text-white selection:bg-white/20 overflow-x-hidden">
      {toast && <ToastNotification toast={toast} />}

      {/* ──────────────── 1. Fixed Ambient Glow Layer (pins colorful glow behind document scroll) ──────────────── */}
      <div className="cinejoy-ambient-glow">
        {ambientGlowUrl && (
          <img
            src={ambientGlowUrl}
            alt=""
            className="w-full h-full object-cover scale-[1.2] blur-[80px] saturate-100 opacity-50"
          />
        )}
        {/* Desktop upper gradient mesh for extra depth */}
        <div
          className="absolute top-0 left-0 w-full h-[40vh] mix-blend-screen opacity-20 hidden lg:block pointer-events-none"
          style={{ maskImage: 'linear-gradient(to bottom, black 0%, transparent 100%)' }}
        >
          {ambientGlowUrl && (
            <img
              src={ambientGlowUrl}
              alt=""
              className="w-full h-full object-cover scale-[1.2] blur-[50px] saturate-100"
            />
          )}
        </div>
      </div>

      {/* ──────────────── Mobile Floating Back Button (Desktop top navbar has onBack) ──────────────── */}
      <div className="fixed top-3 left-4 z-40 md:hidden pointer-events-auto">
        <button
          onClick={() => {
            triggerHaptic('light');
            onBack();
          }}
          className="h-10 w-10 rounded-2xl liquid-glass-pill border border-white/20 hover:border-white/40 text-neutral-200 hover:text-white active:scale-95 transition-all inline-flex items-center justify-center shadow-xl backdrop-blur-xl cursor-pointer"
          title="Back to Library"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>

      {/* Ambient Trailer Audio/Pause Controls */}
      {trailerEmbedUrl && (
        <div className="fixed top-18 md:top-20 right-4 lg:right-10 z-40 flex items-center gap-2 pointer-events-auto">
          <button
            onClick={() => {
              triggerHaptic('light');
              setHeroPaused((prev) => !prev);
            }}
            className="w-10 h-10 rounded-2xl liquid-glass-pill border border-white/20 hover:border-white/40 hover:scale-105 active:scale-95 inline-flex items-center justify-center shadow-xl text-neutral-200 hover:text-white transition-all cursor-pointer backdrop-blur-xl"
            title={heroPaused ? 'Play Trailer Background' : 'Pause Trailer Background'}
            aria-label={heroPaused ? 'Play Trailer' : 'Pause Trailer'}
          >
            {heroPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button
            onClick={() => {
              triggerHaptic('light');
              setHeroMuted((prev) => !prev);
            }}
            className="w-10 h-10 rounded-2xl liquid-glass-pill border border-white/20 hover:border-white/40 hover:scale-105 active:scale-95 inline-flex items-center justify-center shadow-xl text-neutral-200 hover:text-white transition-all cursor-pointer backdrop-blur-xl"
            title={heroMuted ? 'Unmute Trailer' : 'Mute Trailer'}
            aria-label={heroMuted ? 'Unmute Trailer' : 'Mute Trailer'}
          >
            {heroMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>
        </div>
      )}

      {/* ──────────────── 2. Hero Backdrop Container ──────────────── */}
      <section className="relative w-full h-[65vh] lg:h-[75vh] overflow-hidden cinejoy-hero-mask">
        {backdropUrl && (
          <img
            src={backdropUrl}
            alt={item.title}
            className={`w-full h-full object-cover object-top transition-opacity duration-700 ${
              trailerEmbedUrl && !heroPaused ? 'opacity-0' : 'opacity-90'
            }`}
          />
        )}

        {/* Background Ambient Trailer */}
        {trailerEmbedUrl && !heroPaused && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[max(125vw,calc(75vh*16/9))] h-[max(75vh,calc(125vw*9/16))] scale-[1.35]">
              <iframe
                src={`${trailerEmbedUrl}&playsinline=1`}
                title={`${item.title} Background Trailer`}
                className="w-full h-full pointer-events-none opacity-85"
                allow="autoplay; encrypted-media"
                referrerPolicy="strict-origin-when-cross-origin"
              />
            </div>
          </div>
        )}

        {/* Dual Gradient Overlays: Vertical fade + Horizontal Scrim (Desktop) */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-[#050505]/40 to-transparent pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-[#050505]/60 to-transparent pointer-events-none hidden lg:block" />
      </section>

      {/* ──────────────── 3. Overlapping Content Layer (Negative Margin) ──────────────── */}
      <div className="relative z-20 -mt-44 lg:-mt-[22rem] px-6 lg:px-16">
        <div className="lg:flex lg:items-start lg:justify-between lg:gap-12">
          {/* Left Column: Title, Metadata, Action Buttons, Synopsis */}
          <div className="w-full max-w-[750px] lg:max-w-[700px] flex flex-col items-center lg:items-start text-center lg:text-left">
            {/* ClearLogo or Title */}
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={item.title}
                className="max-h-20 sm:max-h-24 lg:max-h-36 max-w-[80%] lg:max-w-[500px] object-contain drop-shadow-[0_8px_30px_rgba(0,0,0,0.9)] mb-3"
              />
            ) : (
              <h1 className="text-3xl sm:text-4xl lg:text-6xl font-black text-white tracking-apple-tight text-wrap-balance drop-shadow-xl mb-2">
                {item.title}
              </h1>
            )}

            {/* Genre Breadcrumb */}
            {genreList.length > 0 && (
              <div className="flex items-center gap-2 text-sm sm:text-base text-white/90 font-medium drop-shadow-md mb-5 flex-wrap justify-center lg:justify-start">
                {genreList.map((g, idx) => (
                  <React.Fragment key={g}>
                    <span>{g}</span>
                    {idx < genreList.length - 1 && <span className="text-white/40">•</span>}
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Action Buttons Row */}
            <div className="flex items-center gap-3.5 flex-wrap justify-center lg:justify-start mb-6">
              {/* Primary Play Button */}
              <button
                onClick={handlePrimaryPlay}
                className="cinejoy-btn-primary px-7 py-3 !h-[44px] flex items-center justify-center gap-2.5 text-base font-bold min-w-[130px] cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>
                  {item.type === 'show'
                    ? nextPlayableEpisode
                      ? `Play S${nextPlayableEpisode.seasonNumber} E${nextPlayableEpisode.episodeNumber}`
                      : 'Play'
                    : item.watchProgress && item.watchProgress.progress > 0
                    ? 'Resume'
                    : 'Play'}
                </span>
              </button>

              {/* Watch Online Button (Stream servers) */}
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setStreamModalTarget({});
                  setShowStreamModal(true);
                }}
                className="cinejoy-btn-circle cursor-pointer"
                title="Watch Online (All Servers)"
                aria-label="Watch Online"
              >
                <Globe className="w-5 h-5" />
              </button>

              {/* Trailer Button */}
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setShowTrailerModal(true);
                }}
                className="cinejoy-btn-circle cursor-pointer"
                title="Play Trailer"
                aria-label="Trailer"
              >
                <Film className="w-5 h-5" />
              </button>

              {/* Watchlist Toggle (hidden for items already in local library) */}
              {!isLocal && tmdbId && (
                <button
                  onClick={toggleWatchlist}
                  disabled={watchlistBusy}
                  className="cinejoy-btn-circle cursor-pointer"
                  title={isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                  aria-label="Watchlist"
                >
                  {isInWatchlist ? <Check className="w-5 h-5 text-emerald-400" /> : <Plus className="w-5 h-5" />}
                </button>
              )}

              {/* Torrent / Direct Download (hidden for movies already in local library) */}
              {(!isLocal || item.type === 'show') && (
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setShowDownloadModal(true);
                  }}
                  className="cinejoy-btn-circle cursor-pointer"
                  title="Download / Find Torrents"
                  aria-label="Download"
                >
                  <Download className="w-5 h-5" />
                </button>
              )}

              {/* Fix Match (for local items) */}
              {isLocal && (
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    if (onFixMatch) onFixMatch(item);
                    else setShowFixMatch(true);
                  }}
                  className="cinejoy-btn-circle cursor-pointer"
                  title="Fix Metadata Match"
                  aria-label="Fix Match"
                >
                  <Sparkles className="w-5 h-5 text-amber-300" />
                </button>
              )}

              {/* Mark Watched Toggle */}
              {onMarkWatched && (
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    const isWatched = item.watchProgress?.completed === 1;
                    onMarkWatched(item, !isWatched);
                  }}
                  className="cinejoy-btn-circle cursor-pointer"
                  title={item.watchProgress?.completed === 1 ? 'Mark as Unwatched' : 'Mark as Watched'}
                  aria-label="Mark Watched"
                >
                  {item.watchProgress?.completed === 1 ? (
                    <EyeOff className="w-5 h-5 text-neutral-400" />
                  ) : (
                    <Eye className="w-5 h-5" />
                  )}
                </button>
              )}

              {/* Auto-Track Toggle (TV Shows only) */}
              {item.type === 'show' && item.tmdbId && (
                <button
                  onClick={toggleTracking}
                  disabled={trackLoading}
                  className="cinejoy-btn-circle cursor-pointer"
                  title={isTracking ? 'Auto-tracking: Active (click to disable)' : 'Auto-track new episodes & download'}
                  aria-label="Auto-track"
                >
                  {isTracking ? (
                    <BellRing className="w-5 h-5 text-amber-400" />
                  ) : (
                    <BellOff className="w-5 h-5 text-neutral-300" />
                  )}
                </button>
              )}
            </div>

            {/* Auto-Track Settings Row (when tracking is enabled) */}
            {item.type === 'show' && item.tmdbId && isTracking && (
              <div className="flex items-center gap-2.5 mb-5 flex-wrap justify-center lg:justify-start">
                <span className="text-xs text-white/50 font-medium">Tracking:</span>
                <LiquidDropdown
                  label="Quality"
                  title="Preferred Quality"
                  options={QUALITY_OPTIONS}
                  value={qualityPref}
                  onChange={(val) => updateQualityPref(val)}
                  align="left"
                  className="min-w-[130px]"
                  pillClassName="liquid-glass-pill px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold text-neutral-200 hover:text-white cursor-pointer"
                />
                <LiquidDropdown
                  label="Destination"
                  title="Download Destination"
                  options={DESTINATION_OPTIONS}
                  value={targetPref}
                  onChange={(val) => updateTargetPref(val)}
                  align="left"
                  className="min-w-[140px]"
                  pillClassName="liquid-glass-pill px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold text-neutral-200 hover:text-white cursor-pointer"
                />
              </div>
            )}

            {/* Primary Metadata Strip */}
            <div className="w-full flex flex-wrap items-center justify-center lg:justify-start gap-x-2.5 gap-y-2 text-sm lg:text-base text-white/80 font-medium mb-4">
              {/* IMDb / TMDB Rating Yellow Badge */}
              {displayRating != null && displayRating > 0 && (
                <span className="bg-[#F5C518] px-2 py-0.5 rounded-md shadow-sm inline-flex items-center">
                  <span className="text-xs sm:text-sm font-bold text-black tracking-tight">
                    {displayRatingSource} {displayRating.toFixed(1)}
                  </span>
                </span>
              )}

              {/* Year */}
              {(item.year || item.firstAirDate) && (
                <span className="font-semibold text-white tabular-nums">
                  {item.year || (item.firstAirDate ? new Date(item.firstAirDate).getFullYear() : '')}
                </span>
              )}

              {/* Runtime or Seasons */}
              {item.type === 'movie' && formattedRuntime && (
                <>
                  <span className="text-white/40">•</span>
                  <span className="tabular-nums">{formattedRuntime}</span>
                </>
              )}

              {item.type === 'show' && (
                <>
                  <span className="text-white/40">•</span>
                  <span className="tabular-nums">
                    {availableSeasons.length} Season{availableSeasons.length !== 1 ? 's' : ''}
                  </span>
                </>
              )}

              {/* Content Type Pill */}
              <span className="px-2 py-0.5 liquid-glass-pill rounded-md border border-white/15 text-neutral-200 uppercase tracking-wide text-xs font-semibold">
                {item.type === 'movie' ? 'Movie' : 'TV Show'}
              </span>

              {/* Colorful Media Tags (4K, HDR, DV, Atmos, Codecs, 7.1) */}
              {getMediaTags(item).map((tag, idx) => (
                <span key={idx} className={`px-2 py-0.5 text-xs rounded font-bold tracking-wide ${tag.cls}`}>
                  {tag.label}
                </span>
              ))}
            </div>

            {/* Tagline */}
            {movieDetails?.tagline && (
              <p className="text-sm lg:text-base italic text-white/60 mb-3 max-w-xl">
                &ldquo;{movieDetails.tagline}&rdquo;
              </p>
            )}

            {/* Synopsis */}
            <p className="text-sm lg:text-base text-white/70 leading-relaxed text-wrap-pretty max-w-2xl mb-6">
              {item.overview || activeDetails?.overview || 'No synopsis available.'}
            </p>
          </div>

          {/* Right Column: Desktop Specs Sidebar Card */}
          <div className="hidden lg:block w-[300px] shrink-0 mt-36">
            <div className="cinejoy-specs-card rounded-2xl overflow-hidden divide-y divide-white/[0.06] text-sm">
              {/* Dynamic Local End Time */}
              {formattedRuntime && dynamicEndTime && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-white/50 font-medium">Runtime</span>
                  <span className="text-white font-semibold tabular-nums">
                    {formattedRuntime} • <span className="text-emerald-400">Ends {dynamicEndTime}</span>
                  </span>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-white/50 font-medium">Status</span>
                <span className="text-white font-semibold">
                  {movieDetails?.status || tvDetails?.status || 'Released'}
                </span>
              </div>

              {/* Language */}
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-white/50 font-medium">Language</span>
                <span className="text-white font-semibold uppercase">
                  {item.language || 'English'}
                </span>
              </div>

              {/* Release / Air Date */}
              {(movieDetails?.releaseDate || tvDetails?.firstAirDate || item.firstAirDate) && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-white/50 font-medium">
                    {item.type === 'show' ? 'First Aired' : 'Release Date'}
                  </span>
                  <span className="text-white font-semibold tabular-nums">
                    {movieDetails?.releaseDate || tvDetails?.firstAirDate || item.firstAirDate}
                  </span>
                </div>
              )}

              {/* Seasons & Episodes Count */}
              {item.type === 'show' && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-white/50 font-medium">Catalog</span>
                  <span className="text-white font-semibold tabular-nums">
                    {availableSeasons.length} Seasons
                  </span>
                </div>
              )}

              {/* Local File Resolution / Format */}
              {item.filePath && (
                <div className="flex items-center justify-between px-4 py-3">
                  <span className="text-white/50 font-medium">Format</span>
                  <span className="text-white font-semibold truncate max-w-[150px] text-right">
                    {item.resolution || '1080p'} • {item.videoCodec || 'H.264'}
                  </span>
                </div>
              )}
            </div>

            {/* Production / Network Logos */}
            {((movieDetails?.productionCompanies && movieDetails.productionCompanies.length > 0) ||
              (tvDetails?.networks && tvDetails.networks.length > 0)) && (
              <div className="mt-4 flex items-center justify-center gap-4 flex-wrap p-3 rounded-xl bg-white/[0.02] border border-white/[0.05]">
                {(movieDetails?.productionCompanies || tvDetails?.networks || [])
                  .filter((p) => p.logoPath)
                  .slice(0, 3)
                  .map((p) => (
                    <img
                      key={p.id}
                      src={`https://image.tmdb.org/t/p/w200${p.logoPath}`}
                      alt={p.name}
                      className="max-h-6 object-contain brightness-0 invert opacity-50"
                    />
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* ──────────────── 4. TV Show Episodes Section (SINGLE UNIFIED PAGE!) ──────────────── */}
        {item.type === 'show' && (
          <section id="episodes-section" className="mt-16 w-full scroll-mt-24">
            {/* Header Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <h2 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Episodes</h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white/10 text-white/70 tabular-nums">
                  {sortedEpisodes.length} Episodes
                </span>
              </div>

              {/* Controls Toolbar */}
              <div className="flex items-center gap-2.5 flex-wrap">
                {/* Ratings View Toggle */}
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setShowRatingsGrid((prev) => !prev);
                  }}
                  className={`h-9 px-3.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 transition-all cursor-pointer ${
                    showRatingsGrid
                      ? 'bg-white text-black border-white'
                      : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                  }`}
                  title="Toggle Ratings Grid"
                >
                  <Grid3X3 className="w-3.5 h-3.5" />
                  <span>Ratings</span>
                </button>

                {/* Sort Order Toggle */}
                <button
                  onClick={() => {
                    triggerHaptic('light');
                    setEpisodesSortOrder((prev) => (prev === 'oldest' ? 'newest' : 'oldest'));
                  }}
                  className="h-9 px-3.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Sort Episodes"
                >
                  <ArrowUpDown className="w-3.5 h-3.5" />
                  <span>{episodesSortOrder === 'oldest' ? 'Oldest' : 'Newest'}</span>
                </button>

                {/* Mark Season as Watched */}
                {onMarkWatched && currentSeasonGroup && (
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      const allWatched = currentSeasonGroup.episodes.every((ep) => ep.watchProgress?.completed === 1);
                      currentSeasonGroup.episodes.forEach((ep) => {
                        onMarkWatched(item, !allWatched, ep.id);
                      });
                      showToast(allWatched ? 'Marked season as unwatched' : 'Marked season as watched', 'success');
                    }}
                    className="h-9 px-3.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Mark Season Watched"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Season Watched</span>
                  </button>
                )}

                {/* Destination Selector Pill */}
                {item.tmdbId && (
                  <div className="flex items-center p-0.5 rounded-full bg-white/10 border border-white/15 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setDownloadTarget('local');
                      }}
                      className={`px-3 py-1.5 rounded-full font-medium transition flex items-center gap-1 cursor-pointer ${
                        downloadTarget === 'local'
                          ? 'bg-white/25 text-white shadow-sm font-semibold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                      title="Save to local disk"
                    >
                      <span>💻</span>
                      <span>Local</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setDownloadTarget('gdrive');
                      }}
                      className={`px-3 py-1.5 rounded-full font-medium transition flex items-center gap-1 cursor-pointer ${
                        downloadTarget === 'gdrive'
                          ? 'bg-blue-500/30 text-blue-300 border border-blue-500/40 shadow-sm font-semibold'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                      title="Save to Google Drive"
                    >
                      <span>☁️</span>
                      <span>Drive</span>
                    </button>
                    {cloudAvailable && (
                      <button
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setDownloadTarget('cloud');
                        }}
                        className={`px-3 py-1.5 rounded-full font-medium transition flex items-center gap-1 cursor-pointer ${
                          downloadTarget === 'cloud'
                            ? 'bg-purple-500/30 text-purple-300 border border-purple-500/40 shadow-sm font-semibold'
                            : 'text-neutral-400 hover:text-white'
                        }`}
                        title="Save via Cloud Worker"
                      >
                        <span>⚡</span>
                        <span>Cloud</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Download Next Episode */}
                {item.id && (
                  <button
                    onClick={handleDownloadNext}
                    disabled={isDownloadingNext}
                    className="h-9 px-3.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title={`Download next episode across all seasons to ${downloadTarget}`}
                  >
                    <Download className={`w-3.5 h-3.5 ${isDownloadingNext ? 'animate-bounce text-sky-400' : 'text-neutral-300'}`} />
                    <span>{isDownloadingNext ? 'Resolving...' : 'Next Episode'}</span>
                  </button>
                )}

                {/* Download Missing Episodes in Season */}
                {item.tmdbId && (
                  <button
                    onClick={handleDownloadMissing}
                    disabled={isDownloadingMissing}
                    className="h-9 px-3.5 rounded-full text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                    title={`Auto download missing episodes in Season ${activeSeason} to ${downloadTarget}`}
                  >
                    {isDownloadingMissing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <DownloadCloud className="w-3.5 h-3.5 text-sky-400" />
                    )}
                    <span>{isDownloadingMissing ? 'Checking...' : 'Fetch Missing'}</span>
                  </button>
                )}

                {/* Season Selector Dropdown */}
                <div className="relative" ref={seasonDropdownRef}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerHaptic('light');
                      setSeasonDropdownOpen((prev) => !prev);
                    }}
                    className="h-9 px-4 rounded-full text-xs font-bold bg-white/15 hover:bg-white/25 text-white border border-white/25 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <span>Season {activeSeason}</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${seasonDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Apple Liquid Glass Dropdown Menu */}
                  {seasonDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-72 max-h-80 overflow-y-auto bg-[#14141c]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] p-2 z-50 glass-scrollbar">
                      {availableSeasons.map((s) => (
                        <button
                          key={s.seasonNumber}
                          onClick={() => {
                            triggerHaptic('light');
                            setActiveSeason(s.seasonNumber);
                            setSeasonDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2.5 rounded-xl flex items-center gap-3 transition-colors cursor-pointer ${
                            s.seasonNumber === activeSeason
                              ? 'bg-white/20 text-white'
                              : 'hover:bg-white/10 text-white/80'
                          }`}
                        >
                          {s.posterPath ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w92${s.posterPath}`}
                              alt=""
                              className="w-8 h-12 rounded object-cover shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-12 rounded bg-white/10 flex items-center justify-center shrink-0">
                              <Tv className="w-4 h-4 text-white/50" />
                            </div>
                          )}
                          <div className="truncate flex-1">
                            <span className="block text-sm font-semibold truncate">{s.name}</span>
                            <span className="block text-xs text-white/50 tabular-nums">
                              {s.episodeCount ? `${s.episodeCount} episodes` : 'Episodes'}
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Ratings Matrix Grid View (Toggleable) */}
            {showRatingsGrid && currentSeasonGroup && (
              <div className="py-6 px-4 my-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-x-auto">
                <h4 className="text-xs uppercase tracking-wider text-white/50 font-bold mb-3">Season Ratings Matrix</h4>
                <div className="flex gap-2 flex-wrap">
                  {currentSeasonGroup.episodes.map((ep) => {
                    const score = episodeScore(ep.imdbRating, ep.rating, ep.voteCount);
                    const val = score?.value || 0;
                    const bgClass =
                      val >= 8.5
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : val >= 7.0
                        ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                        : val > 0
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-white/5 text-white/40 border-white/10';

                    return (
                      <button
                        key={ep.id}
                        onClick={() => handleEpisodePlay(ep)}
                        className={`flex flex-col items-center justify-center w-14 h-14 rounded-xl border transition-transform hover:scale-105 active:scale-95 cursor-pointer ${bgClass}`}
                        title={`E${ep.episodeNumber}: ${ep.title} (${score ? `${score.value.toFixed(1)} ${score.source}` : 'No rating'})`}
                      >
                        <span className="text-[10px] font-bold opacity-70">E{ep.episodeNumber}</span>
                        <span className="text-xs font-black tabular-nums">{val > 0 ? val.toFixed(1) : '—'}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Horizontal Episode Carousel Track */}
            <div className="relative group/episodes mt-4">
              {/* Scroll chevron left */}
              <button
                onClick={() => scrollTrack(episodeTrackRef, 'left')}
                className="hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 items-center justify-center text-white opacity-0 group-hover/episodes:opacity-100 hover:scale-110 active:scale-95 transition-all shadow-2xl cursor-pointer"
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>

              {/* Scroll chevron right */}
              <button
                onClick={() => scrollTrack(episodeTrackRef, 'right')}
                className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 w-12 h-12 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 items-center justify-center text-white opacity-0 group-hover/episodes:opacity-100 hover:scale-110 active:scale-95 transition-all shadow-2xl cursor-pointer"
                aria-label="Scroll right"
              >
                <ChevronRight className="w-6 h-6" />
              </button>

              <div
                ref={episodeTrackRef}
                className="flex gap-6 overflow-x-auto pb-10 pt-2 px-1 scrollbar-hide scroll-smooth"
              >
                {loadingEpisodes ? (
                  <div className="flex items-center justify-center w-full py-16 gap-3 text-white/60">
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                    <span>Loading episodes...</span>
                  </div>
                ) : sortedEpisodes.length === 0 ? (
                  <div className="py-12 text-center text-white/50 w-full">
                    No episodes found for this season.
                  </div>
                ) : (
                  sortedEpisodes.map((ep) => {
                    const epScore = episodeScore(ep.imdbRating, ep.rating, ep.voteCount);
                    const hasProgress = ep.watchProgress && ep.watchProgress.progress > 0;
                    const progressPercent = hasProgress
                      ? Math.min(100, Math.round((ep.watchProgress!.progress / (ep.watchProgress!.duration || 1)) * 100))
                      : 0;

                    return (
                      <div
                        key={ep.id}
                        onClick={() => handleEpisodePlay(ep)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setActiveContextMenu({
                            x: Math.max(10, e.clientX - 160),
                            y: Math.min(window.innerHeight - 240, e.clientY),
                            episode: ep
                          });
                        }}
                        className="flex flex-col gap-3 flex-none w-72 md:w-80 group cursor-pointer transition-transform duration-200 active:scale-95"
                      >
                        {/* 16:9 Thumbnail Frame */}
                        <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black/40 shrink-0 border border-white/10 transition-all duration-300 group-hover:scale-[1.03] group-hover:ring-2 group-hover:ring-white/40 shadow-lg">
                          {ep.stillPath ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w500${ep.stillPath}`}
                              alt={ep.title}
                              className="w-full h-full object-cover transition-transform duration-500 group-hover:brightness-110"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-white/5">
                              <Tv className="w-8 h-8 text-white/30" />
                            </div>
                          )}

                          {/* Hover Play Icon Overlay */}
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="w-12 h-12 rounded-full bg-white/90 text-black flex items-center justify-center shadow-2xl transform scale-90 group-hover:scale-100 transition-transform">
                              <Play className="w-5 h-5 fill-current ml-0.5" />
                            </div>
                          </div>

                          {/* Top-Left Episode Number */}
                          <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[11px] font-bold text-white tabular-nums shadow">
                            E{ep.episodeNumber}
                          </div>

                          {/* Top-Right Watched & Options Actions */}
                          <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 z-10">
                            {onMarkWatched && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerHaptic('light');
                                  const isWatched = ep.watchProgress?.completed === 1;
                                  onMarkWatched(item, !isWatched, ep.id);
                                }}
                                className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border border-white/20 bg-black/60 text-white hover:bg-black/80 transition-all cursor-pointer shadow"
                                title={ep.watchProgress?.completed === 1 ? 'Mark Unwatched' : 'Mark Watched'}
                                aria-label="Watched"
                              >
                                {ep.watchProgress?.completed === 1 ? (
                                  <Eye className="w-4 h-4 text-emerald-400" />
                                ) : (
                                  <EyeOff className="w-4 h-4 text-white/70" />
                                )}
                              </button>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic('light');
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveContextMenu({
                                  x: Math.max(10, rect.left - 160),
                                  y: Math.min(window.innerHeight - 240, rect.bottom + 6),
                                  episode: ep
                                });
                              }}
                              className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md border border-white/20 bg-black/60 text-white hover:bg-black/80 transition-all cursor-pointer shadow"
                              title="Episode options"
                              aria-label="Episode options"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>
                          </div>

                          {/* Bottom-Right Media Tags */}
                          <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1 z-10 flex-wrap justify-end">
                            {getMediaTags(ep).slice(0, 3).map((tag, idx) => (
                              <span
                                key={idx}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide backdrop-blur-md shadow-sm ${tag.cls}`}
                              >
                                {tag.label}
                              </span>
                            ))}
                            {getMediaTags(ep).length === 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] font-semibold text-white/90 tabular-nums">
                                {ep.resolution ? (ep.resolution === '2160p' ? '4K' : ep.resolution) : 'HD'}
                              </span>
                            )}
                          </div>

                          {/* Watch Progress Bar */}
                          {hasProgress && ep.watchProgress?.completed !== 1 && (
                            <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
                              <div
                                className="h-full bg-red-600 transition-all"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          )}
                        </div>

                        {/* Episode Info Below Thumbnail */}
                        <div>
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm font-bold text-white group-hover:text-white/90 transition-colors line-clamp-1">
                              {ep.title}
                            </h3>
                            <div className="flex items-center gap-2 shrink-0">
                              {epScore && (
                                <span className="text-xs text-amber-400 font-bold tabular-nums flex items-center gap-1">
                                  <Star className="w-3 h-3 fill-amber-400" />
                                  {epScore.value.toFixed(1)}
                                </span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerHaptic('light');
                                  setSelectedEpisodePreview(ep);
                                }}
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                                title="Episode Details"
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-white/50 mt-0.5">
                            {ep.airDate && <span>{ep.airDate}</span>}
                            {ep.airDate && ep.runtime && <span>•</span>}
                            {ep.runtime && <span>{ep.runtime} min</span>}
                          </div>
                          <p className="text-xs text-white/60 line-clamp-2 leading-relaxed mt-1">
                            {ep.overview || 'No description available for this episode.'}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        )}

        {/* ──────────────── 5. Cast Carousel ──────────────── */}
        {castList.length > 0 && (
          <section className="mt-14 w-full">
            <h2 className="text-xl lg:text-2xl font-bold text-white mb-4 tracking-tight">Cast & Crew</h2>
            <div className="relative group/cast">
              <button
                onClick={() => scrollTrack(castTrackRef, 'left')}
                className="hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 items-center justify-center text-white opacity-0 group-hover/cast:opacity-100 hover:scale-110 active:scale-95 transition-all shadow-xl cursor-pointer"
                aria-label="Scroll cast left"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => scrollTrack(castTrackRef, 'right')}
                className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 w-11 h-11 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 items-center justify-center text-white opacity-0 group-hover/cast:opacity-100 hover:scale-110 active:scale-95 transition-all shadow-xl cursor-pointer"
                aria-label="Scroll cast right"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <div
                ref={castTrackRef}
                className="flex gap-4 overflow-x-auto pb-4 pt-1 scrollbar-hide scroll-smooth"
              >
                {castList.map((person) => (
                  <div
                    key={person.id}
                    onClick={() => handlePersonClick(person.id)}
                    className="flex flex-col items-center text-center w-28 lg:w-32 flex-none group/actor cursor-pointer transition-transform duration-200 active:scale-95"
                  >
                    <div className="w-20 h-20 lg:w-24 lg:h-24 rounded-full overflow-hidden bg-white/10 mb-2 border border-white/10 group-hover/actor:border-white/40 group-hover/actor:scale-105 transition-all shadow-md">
                      {person.profilePath ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w185${person.profilePath}`}
                          alt={person.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40">
                          <Film className="w-6 h-6" />
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-bold text-white line-clamp-1 group-hover/actor:text-white/90">
                      {person.name}
                    </span>
                    <span className="text-[11px] text-white/50 line-clamp-1">
                      {person.character}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ──────────────── 6. Franchise / Collection Parts ──────────────── */}
        {collectionData && collectionData.parts?.length > 1 && (
          <section className="mt-14 w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl lg:text-2xl font-bold text-white tracking-tight">
                {collectionData.name}
              </h2>
              <span className="text-xs font-semibold text-neutral-400 bg-white/10 px-2.5 py-1 rounded-full border border-white/10">
                {collectionData.parts.length} Films
              </span>
            </div>
            <div className="relative group/collection">
              <button
                onClick={() => scrollTrack(collectionTrackRef, 'left')}
                className="hidden lg:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 items-center justify-center text-white opacity-0 group-hover/collection:opacity-100 hover:scale-110 active:scale-95 transition-all shadow-xl cursor-pointer"
                aria-label="Scroll collection left"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => scrollTrack(collectionTrackRef, 'right')}
                className="hidden lg:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 w-10 h-10 rounded-full bg-black/60 backdrop-blur-xl border border-white/20 items-center justify-center text-white opacity-0 group-hover/collection:opacity-100 hover:scale-110 active:scale-95 transition-all shadow-xl cursor-pointer"
                aria-label="Scroll collection right"
              >
                <ChevronRight className="w-5 h-5" />
              </button>

              <div
                ref={collectionTrackRef}
                className="flex gap-4 overflow-x-auto py-6 -my-4 px-2 -mx-2 scrollbar-hide scroll-smooth"
              >
                {collectionData.parts.map((part, partIdx) => {
                  const isCurrent = part.tmdbId === (item.tmdbId || item.id);
                  return (
                    <CollectionPartCard
                      key={part.tmdbId}
                      part={part}
                      isCurrent={isCurrent}
                      isLast={partIdx === collectionData.parts.length - 1}
                      onOpen={(p) => {
                        handleOpenDiscover({
                          tmdbId: p.tmdbId,
                          mediaType: 'movie',
                          title: p.title,
                          posterPath: p.posterPath,
                          backdropPath: p.backdropPath,
                          overview: p.overview,
                          rating: p.rating,
                          imdbRating: p.imdbRating,
                          year: p.year,
                          popularity: 0,
                        });
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ──────────────── 7. Similar / Recommendations Carousel ──────────────── */}
        {similarItems.length > 0 && (
          <section className="mt-14 pb-24 w-full">
            <h2 className="text-xl lg:text-2xl font-bold text-white mb-4 tracking-tight">You Might Also Like</h2>
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">
              {similarItems.slice(0, 16).map((sim) => (
                <div
                  key={`${sim.mediaType}-${sim.tmdbId}`}
                  onClick={() => {
                    handleOpenDiscover({
                      tmdbId: sim.tmdbId,
                      mediaType: sim.mediaType,
                      title: sim.title,
                      posterPath: sim.posterPath,
                      backdropPath: sim.backdropPath,
                      overview: sim.overview,
                      rating: sim.rating,
                      imdbRating: sim.imdbRating,
                      year: sim.year,
                      popularity: sim.popularity,
                    });
                  }}
                  className="relative col-span-1 transition-transform duration-200 active:scale-95 group/sim cursor-pointer"
                >
                  <ContentCard
                    item={{
                      id: sim.tmdbId,
                      title: sim.title,
                      type: sim.mediaType === 'movie' ? 'movie' : 'show',
                      posterPath: sim.posterPath,
                      backdropPath: sim.backdropPath,
                      overview: sim.overview,
                      rating: sim.rating,
                      imdbRating: sim.imdbRating,
                      year: sim.year ? parseInt(sim.year, 10) : undefined
                    }}
                    onClick={() => {
                      handleOpenDiscover({
                        tmdbId: sim.tmdbId,
                        mediaType: sim.mediaType,
                        title: sim.title,
                        posterPath: sim.posterPath,
                        backdropPath: sim.backdropPath,
                        overview: sim.overview,
                        rating: sim.rating,
                        imdbRating: sim.imdbRating,
                        year: sim.year,
                        popularity: sim.popularity,
                      });
                    }}
                    disableHoverExpand={true}
                    showProgress={false}
                    showTitle={true}
                    showRating={true}
                  />
                  <span className="text-xs font-semibold text-white/80 line-clamp-1 mt-1.5 block group-hover/sim:text-white transition-colors">
                    {sim.title}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {/* ──────────────── Modals Triggered on Demand ──────────────── */}
      {showStreamModal && (
        <StreamServerModal
          tmdbId={item.tmdbId || 0}
          type={item.type === 'show' ? 'tv' : 'movie'}
          title={item.title}
          season={streamModalTarget?.season}
          episode={streamModalTarget?.episode}
          onClose={() => setShowStreamModal(false)}
        />
      )}

      {showDownloadModal && (
        <DownloadModal
          isOpen={showDownloadModal}
          title={item.title}
          year={item.year?.toString()}
          mediaType={item.type === 'show' ? 'tv' : 'movie'}
          posterPath={item.posterPath}
          tmdbId={item.tmdbId || undefined}
          onClose={() => setShowDownloadModal(false)}
        />
      )}

      {showTrailerModal && (
        <TrailerModal
          isOpen={showTrailerModal}
          tmdbId={item.tmdbId || 0}
          mediaType={item.type === 'show' ? 'tv' : 'movie'}
          title={item.title}
          onClose={() => setShowTrailerModal(false)}
        />
      )}

      {showFixMatch && item.filePath && (
        <FixMatchModal
          item={item as any}
          isOpen={showFixMatch}
          onClose={() => setShowFixMatch(false)}
          onMatched={() => {
            setShowFixMatch(false);
            showToast('Metadata refreshed', 'success');
          }}
          onShowToast={(msg, type) => showToast(msg, type)}
        />
      )}

      {/* ──────────────── Episode Context Menu ──────────────── */}
      {activeContextMenu && (
        <>
          <div
            className="fixed inset-0 z-[120]"
            onClick={(e) => {
              e.stopPropagation();
              setActiveContextMenu(null);
            }}
          />
          <div
            className="fixed z-[130] bg-[#14141c]/95 border border-white/20 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.85)] min-w-56 divide-y divide-white/10 backdrop-blur-2xl animate-in zoom-in-95 duration-150 p-1"
            style={{ left: activeContextMenu.x, top: activeContextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3.5 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">Episode Options</p>
              <p className="text-xs font-semibold truncate text-white mt-0.5">
                S{activeContextMenu.episode.seasonNumber} E{activeContextMenu.episode.episodeNumber} • {activeContextMenu.episode.title}
              </p>
            </div>
            <div className="p-1 space-y-0.5">
              <button
                onClick={() => {
                  const ep = activeContextMenu.episode;
                  setActiveContextMenu(null);
                  handleEpisodePlay(ep);
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-white text-xs font-semibold w-full text-left transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Episode</span>
              </button>

              <button
                onClick={() => {
                  const ep = activeContextMenu.episode;
                  setActiveContextMenu(null);
                  setStreamModalTarget({ season: ep.seasonNumber, episode: ep.episodeNumber });
                  setShowStreamModal(true);
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-white text-xs font-semibold w-full text-left transition cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 text-sky-400" />
                <span>Watch Online</span>
              </button>

              <button
                onClick={() => {
                  const ep = activeContextMenu.episode;
                  setActiveContextMenu(null);
                  setSelectedEpisodePreview(ep);
                }}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-white text-xs font-semibold w-full text-left transition cursor-pointer"
              >
                <Info className="w-3.5 h-3.5 text-amber-300" />
                <span>View Details</span>
              </button>

              {onMarkWatched && (
                <button
                  onClick={() => {
                    const ep = activeContextMenu.episode;
                    setActiveContextMenu(null);
                    const isWatched = ep.watchProgress?.completed === 1;
                    onMarkWatched(item, !isWatched, ep.id);
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-white text-xs font-semibold w-full text-left transition cursor-pointer"
                >
                  {activeContextMenu.episode.watchProgress?.completed === 1 ? (
                    <>
                      <EyeOff className="w-3.5 h-3.5 text-neutral-400" />
                      <span>Mark as Unwatched</span>
                    </>
                  ) : (
                    <>
                      <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Mark as Watched</span>
                    </>
                  )}
                </button>
              )}

              {onRemoveEpisodeFromLibrary && (
                <button
                  onClick={() => {
                    const epId = activeContextMenu.episode.id;
                    setActiveContextMenu(null);
                    onRemoveEpisodeFromLibrary(epId);
                    showToast('Episode removed from library', 'success');
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/10 text-white/80 hover:text-white text-xs font-semibold w-full text-left transition cursor-pointer"
                >
                  <BookmarkMinus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Remove from Library</span>
                </button>
              )}

              {onDeleteEpisode && (
                <button
                  onClick={() => {
                    const epId = activeContextMenu.episode.id;
                    setActiveContextMenu(null);
                    onDeleteEpisode(epId);
                    showToast('Episode deleted permanently', 'success');
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rose-500/20 text-rose-300 hover:text-rose-200 text-xs font-semibold w-full text-left transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                  <span>Delete from Disk</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* ──────────────── Single Episode Detail Preview Modal ──────────────── */}
      {selectedEpisodePreview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Episode details"
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={() => setSelectedEpisodePreview(null)}
        >
          <div
            className="relative w-full max-w-2xl bg-[#12121a]/95 border border-white/20 rounded-3xl overflow-hidden shadow-[0_25px_70px_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Still */}
            <div className="relative aspect-video w-full overflow-hidden bg-black/60">
              {selectedEpisodePreview.stillPath ? (
                <img
                  src={`https://image.tmdb.org/t/p/original${selectedEpisodePreview.stillPath}`}
                  alt={selectedEpisodePreview.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-white/5">
                  <Tv className="w-12 h-12 text-white/30" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#12121a] via-[#12121a]/30 to-transparent" />

              <button
                onClick={() => setSelectedEpisodePreview(null)}
                aria-label="Close"
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="absolute bottom-4 left-6 right-6">
                <span className="px-2.5 py-1 rounded-md bg-white/20 backdrop-blur-md text-xs font-bold text-white uppercase tracking-wider">
                  Season {selectedEpisodePreview.seasonNumber} • Episode {selectedEpisodePreview.episodeNumber}
                </span>
                <h3 className="text-xl sm:text-2xl font-bold text-white mt-2">
                  {selectedEpisodePreview.title}
                </h3>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              {/* Actions row */}
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <button
                  onClick={() => {
                    const ep = selectedEpisodePreview;
                    setSelectedEpisodePreview(null);
                    handleEpisodePlay(ep);
                  }}
                  className="cinejoy-btn-primary px-6 py-2.5 text-sm font-bold flex items-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    {selectedEpisodePreview.watchProgress && selectedEpisodePreview.watchProgress.progress > 0
                      ? 'Resume'
                      : 'Play Episode'}
                  </span>
                </button>

                <button
                  onClick={() => {
                    const ep = selectedEpisodePreview;
                    setSelectedEpisodePreview(null);
                    setStreamModalTarget({ season: ep.seasonNumber, episode: ep.episodeNumber });
                    setShowStreamModal(true);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
                >
                  <Globe className="w-4 h-4 text-sky-400" />
                  <span>Watch Online</span>
                </button>

                {onMarkWatched && (
                  <button
                    onClick={() => {
                      const isWatched = selectedEpisodePreview.watchProgress?.completed === 1;
                      onMarkWatched(item, !isWatched, selectedEpisodePreview.id);
                      setSelectedEpisodePreview({
                        ...selectedEpisodePreview,
                        watchProgress: {
                          progress: isWatched ? 0 : (selectedEpisodePreview.watchProgress?.duration || 100),
                          duration: selectedEpisodePreview.watchProgress?.duration || 100,
                          completed: isWatched ? 0 : 1,
                        }
                      });
                    }}
                    className="px-4 py-2.5 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
                  >
                    {selectedEpisodePreview.watchProgress?.completed === 1 ? (
                      <>
                        <EyeOff className="w-4 h-4 text-neutral-400" />
                        <span>Mark Unwatched</span>
                      </>
                    ) : (
                      <>
                        <Eye className="w-4 h-4 text-emerald-400" />
                        <span>Mark Watched</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Codecs & specs badges */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                {getMediaTags(selectedEpisodePreview).map((tag, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded text-xs font-bold tracking-wide backdrop-blur-md shadow-sm ${tag.cls}`}
                  >
                    {tag.label}
                  </span>
                ))}
              </div>

              {/* Synopsis */}
              <p className="text-sm text-white/80 leading-relaxed">
                {selectedEpisodePreview.overview || 'No episode description available.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── Cast Member Filmography Modal ──────────────── */}
      {personModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cast member details"
          className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-xl flex items-center justify-center p-0 sm:p-4 overflow-y-auto"
          onClick={() => setPersonModalOpen(false)}
        >
          <div
            className="w-full min-h-[100dvh] sm:min-h-0 sm:max-w-4xl sm:max-h-[90vh] bg-[#12121a]/95 border border-white/20 rounded-none sm:rounded-3xl overflow-hidden flex flex-col shadow-[0_25px_70px_rgba(0,0,0,0.9)] animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold tracking-tight text-white">Cast Filmography</h3>
                {personData && <p className="text-xs text-white/50 mt-1">{personData.name}</p>}
              </div>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setPersonModalOpen(false);
                }}
                aria-label="Close"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 overflow-y-auto flex-1 glass-scrollbar">
              {loadingPerson && (
                <div className="flex items-center justify-center py-16 gap-3 text-white/60">
                  <Loader2 className="w-6 h-6 animate-spin text-white" />
                  <span>Loading actor credits...</span>
                </div>
              )}

              {!loadingPerson && personData && (
                <>
                  <div className="flex gap-4 sm:gap-6 mb-6 items-start">
                    <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-2xl overflow-hidden bg-white/10 shrink-0 border border-white/15 shadow-md">
                      {personData.profilePath ? (
                        <TMDBImage
                          src={personData.profilePath}
                          alt={personData.name}
                          tmdbSize="w185"
                          fill
                          sizes="96px"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-white/40">
                          <User className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xl font-bold text-white tracking-tight">{personData.name}</h4>
                      {personData.biography && (
                        <p className="text-xs sm:text-sm text-white/70 mt-1.5 line-clamp-4 leading-relaxed">
                          {personData.biography}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Filter and Sort Toolbar */}
                  <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-white/10">
                    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/[0.04] border border-white/10">
                      {personCreditFilters.map((filter) => {
                        const count = filter.value === 'all'
                          ? personData.credits.length
                          : personData.credits.filter((c) => c.mediaType === filter.value).length;
                        return (
                          <button
                            key={filter.value}
                            onClick={() => setPersonCreditFilter(filter.value)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                              personCreditFilter === filter.value
                                ? 'bg-white text-black font-bold shadow-md'
                                : 'text-white/60 hover:text-white'
                            }`}
                          >
                            {filter.label} ({count})
                          </button>
                        );
                      })}
                    </div>

                    <LiquidDropdown
                      label="Sort: Date"
                      title="Sort Filmography"
                      options={PERSON_SORT_OPTIONS}
                      value={personCreditSort}
                      onChange={(val) => setPersonCreditSort(val as PersonCreditSort)}
                      align="right"
                      className="min-w-[140px]"
                      pillClassName="liquid-glass-pill px-3 py-1.5 rounded-xl flex items-center justify-between gap-2 text-xs font-semibold text-neutral-200 hover:text-white cursor-pointer"
                    />
                  </div>

                  {/* Credits Grid */}
                  {filteredPersonCredits.length > 0 ? (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {filteredPersonCredits.slice(0, visiblePersonCredits).map((credit, idx) => (
                          <div
                            key={`${credit.mediaType}-${credit.tmdbId}-${idx}`}
                            onClick={() => {
                              setPersonModalOpen(false);
                              handleOpenDiscover(credit);
                            }}
                            className="flex flex-col gap-1.5 p-2 rounded-xl bg-white/[0.02] hover:bg-white/[0.08] border border-white/10 hover:border-white/25 transition-all duration-200 cursor-pointer group active:scale-95"
                          >
                            <div className="relative aspect-[2/3] w-full rounded-lg overflow-hidden bg-white/5 border border-white/10 group-hover:scale-105 transition-transform duration-300">
                              {credit.posterPath ? (
                                <TMDBImage
                                  src={credit.posterPath}
                                  alt={credit.title}
                                  tmdbSize="w342"
                                  fill
                                  sizes="(max-width: 640px) 50vw, 25vw"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-white/30">
                                  {credit.mediaType === 'movie' ? <Film className="w-8 h-8" /> : <Tv className="w-8 h-8" />}
                                </div>
                              )}
                            </div>
                            <span className="text-xs font-bold text-white line-clamp-1 group-hover:text-white/90">
                              {credit.title}
                            </span>
                            <div className="flex items-center justify-between text-[10px] text-white/50">
                              <span>{credit.year || '—'}</span>
                              {credit.character && (
                                <span className="truncate max-w-[100px]" title={credit.character}>
                                  as {credit.character}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {filteredPersonCredits.length > visiblePersonCredits && (
                        <div className="flex justify-center mt-6">
                          <button
                            onClick={() => setVisiblePersonCredits((prev) => prev + 12)}
                            className="px-5 py-2.5 text-xs font-bold rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 transition cursor-pointer"
                          >
                            See More ({filteredPersonCredits.length - visiblePersonCredits} remaining)
                          </button>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-12 text-white/40 text-sm">
                      No titles found for this category.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
