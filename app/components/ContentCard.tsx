'use client';

import { memo, useState, useRef, useEffect } from 'react';
import { Film, Tv, Play, Info, X } from 'lucide-react';
import clsx from 'clsx';
import TMDBImage from './TMDBImage';
import { triggerHaptic } from '@/lib/haptics';
import { apiUrl } from '@/lib/mobileConfig';

// Module-level logo cache to prevent repeated network requests
const logoCache: Record<string, string | null> = {};

type WatchProgress = {
    progress: number;
    duration: number;
    completed: number;
};

export type ContentItem = {
    id: number;
    type: 'movie' | 'show';
    title: string;
    logoPath?: string | null;
    posterPath: string | null;
    backdropPath: string | null;
    overview: string | null;
    genres?: string | null;
    year?: number;
    firstAirDate?: string | null;
    rating: number | null;
    imdbRating?: number | null;
    filePath?: string;
    isHDR?: boolean;
    resolution?: string | null;
    videoCodec?: string | null;
    audioCodec?: string | null;
    audioChannels?: string | null;
    tmdbId?: number | null;
    watchProgress?: WatchProgress;
};

type Props = {
    item: ContentItem;
    onClick: () => void;
    onPlay?: (item: ContentItem) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    showProgress?: boolean;
    showTitle?: boolean;
    showRating?: boolean;
    reflowMode?: boolean;
    isExpanded?: boolean;
    onHoverChange?: (hovered: boolean) => void;
};

function ContentCard({
    item,
    onClick,
    onPlay,
    onContextMenu,
    showProgress = true,
    showTitle = true,
    showRating = true,
    reflowMode = false,
    isExpanded: controlledIsExpanded,
    onHoverChange,
}: Props) {
    const cardRef = useRef<HTMLDivElement>(null);
    const expandedCardRef = useRef<HTMLDivElement>(null);
    const [horizontalOrigin, setHorizontalOrigin] = useState<'left' | 'right'>('left');
    const [internalIsHovered, setInternalIsHovered] = useState(false);
    const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);
    const leaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    const activeExpanded = controlledIsExpanded !== undefined ? controlledIsExpanded : internalIsHovered;

    const setHoverState = (val: boolean) => {
        setInternalIsHovered(val);
        onHoverChange?.(val);
    };

    const logoCacheKey = `${item.type}-${item.tmdbId || item.id}`;
    const [logoUrl, setLogoUrl] = useState<string | null>(() => {
        if (item.logoPath) {
            return item.logoPath.startsWith('http') ? item.logoPath : `https://image.tmdb.org/t/p/w500${item.logoPath}`;
        }
        const cached = logoCache[logoCacheKey];
        return cached ? `https://image.tmdb.org/t/p/w500${cached}` : null;
    });

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
        };
    }, []);

    // Dismiss expanded card on outside click or touch (mobile & tablet)
    useEffect(() => {
        if (!activeExpanded) return;
        const handleOutsideInteraction = (e: MouseEvent | TouchEvent) => {
            const target = e.target;
            if (target instanceof Node) {
                const isInsideCard = cardRef.current?.contains(target);
                const isInsideExpanded = expandedCardRef.current?.contains(target);
                if (!isInsideCard && !isInsideExpanded) {
                    setHoverState(false);
                }
            } else {
                setHoverState(false);
            }
        };
        document.addEventListener('mousedown', handleOutsideInteraction);
        document.addEventListener('touchstart', handleOutsideInteraction, { passive: true });
        return () => {
            document.removeEventListener('mousedown', handleOutsideInteraction);
            document.removeEventListener('touchstart', handleOutsideInteraction);
        };
    }, [activeExpanded]);

    // Fetch official TMDB logo on hover if not yet cached
    useEffect(() => {
        if (logoUrl || !activeExpanded) return;
        const targetId = item.tmdbId || item.id;
        if (!targetId) return;

        if (logoCacheKey in logoCache) {
            if (logoCache[logoCacheKey]) {
                setLogoUrl(`https://image.tmdb.org/t/p/w500${logoCache[logoCacheKey]}`);
            }
            return;
        }

        let cancelled = false;
        const fetchLogo = async () => {
            try {
                const mediaType = item.type === 'show' ? 'tv' : 'movie';
                const res = await fetch(apiUrl(`/api/tmdb-details?id=${targetId}&type=${mediaType}`), { credentials: 'same-origin' });
                if (!res.ok || cancelled) return;
                const data = await res.json();
                const fetchedLogo = data.logoPath || null;
                logoCache[logoCacheKey] = fetchedLogo;
                if (!cancelled && fetchedLogo) {
                    setLogoUrl(`https://image.tmdb.org/t/p/w500${fetchedLogo}`);
                }
            } catch {
                logoCache[logoCacheKey] = null;
            }
        };

        void fetchLogo();
        return () => { cancelled = true; };
    }, [activeExpanded, item.id, item.tmdbId, item.type, logoCacheKey, logoUrl]);

    const year = item.year || (item.firstAirDate ? item.firstAirDate.substring(0, 4) : '');
    const progressPercent = item.watchProgress && item.watchProgress.duration > 0
        ? (item.watchProgress.progress / item.watchProgress.duration) * 100
        : 0;
    const displayRating = item.imdbRating ?? item.rating;

    const handleMouseEnter = () => {
        // Cancel any pending leave timer immediately when mouse enters or stays inside
        if (leaveTimerRef.current) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
        }

        if (!reflowMode && cardRef.current) {
            const rect = cardRef.current.getBoundingClientRect();
            const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
            const neededWidth = rect.width * 2 + 16;
            if (rect.left + neededWidth > viewportWidth - 10) {
                setHorizontalOrigin('right');
            } else {
                setHorizontalOrigin('left');
            }
        }

        if (activeExpanded) return;

        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = setTimeout(() => {
            setHoverState(true);
        }, 90);
    };

    const handleMouseLeave = (e?: React.MouseEvent) => {
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }

        // Check if pointer moved into cardRef or expandedCardRef
        const nextTarget = e?.relatedTarget;
        if (nextTarget instanceof Node) {
            if (
                (cardRef.current && cardRef.current.contains(nextTarget)) ||
                (expandedCardRef.current && expandedCardRef.current.contains(nextTarget))
            ) {
                return;
            }
        }

        // Debounce leave with a 100ms grace window to prevent edge-flicker or ping-pong loops
        if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
        leaveTimerRef.current = setTimeout(() => {
            setHoverState(false);
            leaveTimerRef.current = null;
        }, 100);
    };

    const handleCardClick = (e: React.MouseEvent) => {
        // Check if event was triggered by touch or device lacks hover capability (mobile/tablet)
        const isTouchEvent = (e.nativeEvent as PointerEvent).pointerType === 'touch';
        const lacksHover = typeof window !== 'undefined' && !window.matchMedia('(hover: hover)').matches;

        if ((isTouchEvent || lacksHover) && !activeExpanded) {
            e.stopPropagation();
            triggerHaptic('light');
            if (!reflowMode && cardRef.current) {
                const rect = cardRef.current.getBoundingClientRect();
                const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
                const neededWidth = rect.width * 2 + 16;
                if (rect.left + neededWidth > viewportWidth - 10) {
                    setHorizontalOrigin('right');
                } else {
                    setHorizontalOrigin('left');
                }
            }
            setHoverState(true);
            return;
        }

        triggerHaptic('light');
        onClick();
    };

    // Format tags helper
    const renderFormatTags = (compact = false) => {
        if (item.filePath === undefined) return null;
        const tags: { label: string; cls: string }[] = [];
        const fp = item.filePath.toUpperCase();

        if (item.resolution) {
            tags.push({ label: item.resolution === '2160p' ? '4K' : item.resolution, cls: 'bg-blue-500/85 text-white border-blue-400/40' });
        }
        if (item.isHDR || /\bHDR\b/.test(fp)) {
            tags.push({ label: /HDR10\+|HDR10PLUS/.test(fp) ? 'HDR10+' : /HDR10/.test(fp) ? 'HDR10' : 'HDR', cls: 'bg-amber-500/85 text-black border-amber-300/50' });
        }
        if (/\bDOVI\b|\bDV\b|DOLBY.?VISION/.test(fp)) {
            tags.push({ label: 'DV', cls: 'bg-fuchsia-600/85 text-white border-fuchsia-400/40' });
        }
        if (/\bIMAX\b/.test(fp)) {
            tags.push({ label: 'IMAX', cls: 'bg-cyan-500/85 text-black border-cyan-300/50' });
        }
        if (/\bREMUX\b/.test(fp)) {
            tags.push({ label: 'Remux', cls: 'bg-emerald-500/85 text-black border-emerald-300/50' });
        }
        if (/\bATMOS\b/.test(fp)) {
            tags.push({ label: 'Atmos', cls: 'bg-indigo-600/85 text-white border-indigo-400/40' });
        }
        if (tags.length === 0 && !item.isHDR) {
            tags.push({ label: 'SDR', cls: 'bg-neutral-800/85 text-neutral-300 border-white/10' });
        }

        if (tags.length === 0) return null;

        return (
            <div className={clsx("absolute top-2 left-2 flex gap-1 z-20 pointer-events-none", compact ? "flex-row flex-wrap" : "flex-col")}>
                {tags.map((t, i) => (
                    <span key={i} className={`px-1.5 py-0.5 text-[10px] rounded-md font-bold tracking-wider backdrop-blur-md shadow-sm border ${t.cls}`}>
                        {t.label}
                    </span>
                ))}
            </div>
        );
    };

    return (
        <div
            ref={cardRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            className={clsx(
                "relative select-none",
                reflowMode
                    ? (activeExpanded ? "w-full h-full aspect-[4/3] z-20" : "aspect-[2/3] w-full z-10")
                    : (clsx("aspect-[2/3] w-full", activeExpanded ? "z-[999]" : "z-10"))
            )}
        >
            {/* 1. RESTING CARD (Vertical 2:3 Portrait - Stays strictly in grid cell) */}
            <div
                onClick={handleCardClick}
                onContextMenu={onContextMenu}
                className={clsx(
                    "relative w-full h-full rounded-2xl overflow-hidden cursor-pointer",
                    "liquid-card liquid-sheen-effect shadow-md border border-white/10",
                    reflowMode ? "transition-opacity duration-200" : "transition-all duration-300 ease-out",
                    activeExpanded
                        ? (reflowMode ? "hidden" : "opacity-0 scale-95 pointer-events-none")
                        : "opacity-100 scale-100",
                    "active:scale-[0.97]"
                )}
            >
                {/* Poster Image */}
                {item.posterPath ? (
                    <TMDBImage
                        src={item.posterPath}
                        alt={item.title}
                        tmdbSize="w342"
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, (max-width: 1536px) 16vw, 12vw"
                        className="w-full h-full object-cover transition duration-500"
                        fallback={
                            <div className="w-full h-full flex items-center justify-center p-4 text-center text-[var(--text-muted)] bg-[var(--surface-2)]">
                                <div>
                                    {item.type === 'movie' ? <Film className="w-8 h-8 mx-auto mb-2" /> : <Tv className="w-8 h-8 mx-auto mb-2" />}
                                    <span className="text-sm">{item.title}</span>
                                </div>
                            </div>
                        }
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center p-4 text-center text-[var(--text-muted)] bg-[var(--surface-2)]">
                        <div>
                            {item.type === 'movie' ? <Film className="w-8 h-8 mx-auto mb-2" /> : <Tv className="w-8 h-8 mx-auto mb-2" />}
                            <span className="text-sm">{item.title}</span>
                        </div>
                    </div>
                )}

                {/* Resting Format Tags */}
                {renderFormatTags()}

                {/* Watched badge as crystal pill */}
                {item.watchProgress?.completed === 1 && (
                    <span className="!absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 text-xs rounded-full font-bold z-20 backdrop-blur-md shadow-md pointer-events-none select-none">
                        ✓ Watched
                    </span>
                )}

                {/* Rating badge (if not watched) */}
                {(!item.watchProgress || item.watchProgress.completed !== 1) && showRating && displayRating != null && displayRating > 0 && (
                    <div className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-black/70 backdrop-blur-sm border border-white/15 z-20 pointer-events-none shadow-sm">
                        <span className="text-[#F5C518] text-[10px] font-black">IMDb</span>
                        <span className="text-white text-xs font-bold">{displayRating.toFixed(1)}</span>
                    </div>
                )}

                {/* Glowing liquid progress bar */}
                {showProgress && progressPercent > 0 && progressPercent < 95 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60 backdrop-blur-sm z-20">
                        <div
                            className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 transition-all rounded-r-full shadow-[0_0_10px_rgba(244,63,94,0.8)]"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                )}

                {/* Resting title overlay */}
                {showTitle && (
                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/95 via-black/60 to-transparent z-10 pointer-events-none">
                        <p className="text-xs sm:text-sm font-bold text-white truncate drop-shadow-md">{item.title}</p>
                        <div className="flex items-center justify-between text-[11px] text-neutral-300 font-medium mt-0.5">
                            <span>{item.type === 'movie' ? 'Movie' : 'TV Series'}</span>
                            {year && <span>{year}</span>}
                        </div>
                    </div>
                )}
            </div>

            {/* 2. EXPANDED HOVER CARD (Prime Video 2-Card Banner Expansion - Responsive across Mobile & Desktop) */}
            <div
                ref={expandedCardRef}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                onClick={() => {
                    triggerHaptic('light');
                    onClick();
                }}
                onContextMenu={onContextMenu}
                className={clsx(
                    reflowMode
                        ? clsx(
                            "relative w-full h-full",
                            activeExpanded ? "pointer-events-auto opacity-100 scale-100 block" : "pointer-events-none opacity-0 scale-95 hidden"
                        )
                        : clsx(
                            "!absolute top-0 h-full !z-[1000] w-[calc(200%+1rem)] max-w-[calc(100vw-2rem)]",
                            horizontalOrigin === 'left' ? "left-0 origin-top-left" : "right-0 origin-top-right",
                            activeExpanded ? "pointer-events-auto opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95"
                        ),
                    reflowMode
                        ? "transition-opacity duration-200 ease-out"
                        : "transition-all duration-300 ease-[cubic-bezier(0.2,0,0.2,1)]",
                    "rounded-2xl overflow-hidden bg-[#121218]/95 backdrop-blur-md border border-white/20",
                    "shadow-[0_20px_45px_rgba(0,0,0,0.9),0_0_20px_rgba(255,255,255,0.1)]",
                    "liquid-sheen-effect",
                    "cursor-pointer"
                )}
            >
                {/* 16:9 Landscape Backdrop Image with Zoom on Hover */}
                <div className="absolute inset-0 w-full h-full overflow-hidden">
                    {item.backdropPath || item.posterPath ? (
                        <TMDBImage
                            src={item.backdropPath || item.posterPath}
                            alt={item.title}
                            tmdbSize="w780"
                            fill
                            sizes="(max-width: 1200px) 50vw, 35vw"
                            className={clsx(
                                "w-full h-full object-cover object-center transition-transform duration-500 ease-out",
                                activeExpanded ? "scale-105" : "scale-100"
                            )}
                        />
                    ) : (
                        <div className="w-full h-full flex items-center justify-center p-6 text-center text-[var(--text-muted)] bg-[var(--surface-2)]">
                            <div>
                                {item.type === 'movie' ? <Film className="w-10 h-10 mx-auto mb-2" /> : <Tv className="w-10 h-10 mx-auto mb-2" />}
                                <span className="text-sm font-semibold">{item.title}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Dark Cinematic Gradient Vignette matching HeroSection */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/70 via-50% to-transparent pointer-events-none" />
                <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-transparent pointer-events-none" />

                {/* Mobile / Touch explicit close button */}
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic('light');
                        setHoverState(false);
                    }}
                    className="!absolute top-2 right-2 z-40 w-7 h-7 rounded-full liquid-glass-pill bg-black/70 hover:bg-black/90 text-white flex items-center justify-center cursor-pointer transition sm:hidden shadow-md border border-white/20"
                    aria-label="Close preview"
                >
                    <X className="w-3.5 h-3.5 text-neutral-300 hover:text-white" />
                </button>

                {/* Watched badge */}
                {item.watchProgress?.completed === 1 && (
                    <span className="!absolute top-2 right-10 sm:right-2.5 inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 text-[10px] sm:text-xs rounded-full font-bold z-30 backdrop-blur-md shadow-md pointer-events-none select-none">
                        ✓ Watched
                    </span>
                )}

                {/* Format tags in expanded card (compact row top-left) */}
                {renderFormatTags(true)}

                {/* Glowing progress bar */}
                {showProgress && progressPercent > 0 && progressPercent < 95 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60 backdrop-blur-sm z-30">
                        <div
                            className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 transition-all rounded-r-full shadow-[0_0_10px_rgba(244,63,94,0.8)]"
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                )}

                {/* Expanded Card Content & Controls with Snappy Reveal Animation */}
                <div className={clsx(
                    "absolute inset-0 p-3 sm:p-4 md:p-5 flex flex-col justify-end z-20 pointer-events-auto",
                    activeExpanded && "animate-card-reveal"
                )}>
                    {/* Proper Logo / Title Icon or Styled Heading */}
                    {logoUrl ? (
                        <div className="relative mb-1 sm:mb-2 shrink-0">
                            <TMDBImage
                                src={logoUrl}
                                alt={item.title}
                                width={360}
                                height={110}
                                className="h-7 sm:h-9 md:h-11 max-w-[70%] sm:max-w-[75%] w-auto object-contain object-left drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)]"
                                fallback={
                                    showTitle ? (
                                        <h3 className="text-sm sm:text-base md:text-lg font-black drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] leading-tight tracking-tight text-white line-clamp-1">
                                            {item.title}
                                        </h3>
                                    ) : null
                                }
                            />
                        </div>
                    ) : (
                        showTitle && (
                            <h3 className="text-sm sm:text-base md:text-lg font-black drop-shadow-[0_2px_12px_rgba(0,0,0,0.95)] leading-tight tracking-tight text-white line-clamp-1 mb-1 sm:mb-2">
                                {item.title}
                            </h3>
                        )
                    )}

                    {/* Metadata line with liquid glass pills */}
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-xs font-semibold flex-wrap mb-1.5 sm:mb-2">
                        <span className="liquid-glass-pill px-2 py-0.5 rounded-md sm:rounded-lg uppercase tracking-wider text-[9px] sm:text-[10px] text-neutral-100 font-bold border border-white/20 shadow-sm">
                            {item.type === 'show' ? 'TV Series' : 'Movie'}
                        </span>
                        {showRating && displayRating != null && displayRating > 0 && (
                            <span
                                className="inline-flex items-center overflow-hidden rounded-md sm:rounded-lg border border-[#F5C518]/80 bg-black/75 shadow-sm"
                                aria-label={`IMDb rating ${displayRating.toFixed(1)}`}
                            >
                                <span className="bg-[#F5C518] px-1.5 py-0.5 text-[9px] sm:text-[10px] font-black text-black">IMDb</span>
                                <span className="px-1.5 py-0.5 text-[9px] sm:text-[10px] font-bold text-white">{displayRating.toFixed(1)}</span>
                            </span>
                        )}
                        {year && (
                            <span className="text-neutral-200 drop-shadow text-[10px] sm:text-xs font-semibold">
                                {year}
                            </span>
                        )}
                        {item.isHDR && (
                            <span className="liquid-glass-pill px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 text-[9px] sm:text-[10px] rounded-md sm:rounded-lg font-bold border border-yellow-500/50 shadow-[0_0_12px_rgba(234,179,8,0.25)]">
                                HDR
                            </span>
                        )}
                        {item.resolution && (
                            <span className="liquid-glass-pill px-1.5 py-0.5 bg-blue-500/20 text-blue-300 text-[9px] sm:text-[10px] rounded-md sm:rounded-lg font-bold border border-blue-500/50 shadow-[0_0_12px_rgba(59,130,246,0.25)]">
                                {item.resolution === '2160p' ? '4K' : item.resolution}
                            </span>
                        )}
                        {item.genres && (
                            <span className="text-neutral-300 drop-shadow text-[10px] sm:text-[11px] font-medium truncate max-w-[130px] sm:max-w-[180px]">
                                {item.genres.split(',').slice(0, 2).join(' • ')}
                            </span>
                        )}
                    </div>

                    {/* Synopsis */}
                    {item.overview && (
                        <p className="text-[11px] sm:text-xs md:text-sm text-neutral-100/95 drop-shadow-md leading-relaxed line-clamp-2 mb-2 sm:mb-3 font-normal">
                            {item.overview}
                        </p>
                    )}

                    {/* Banner-style Liquid Action Buttons */}
                    <div className="flex items-center gap-2 sm:gap-2.5 pt-0.5">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic('medium');
                                if (onPlay) {
                                    onPlay(item);
                                } else {
                                    onClick();
                                }
                            }}
                            className="liquid-btn-primary px-3 sm:px-4 md:px-5 py-1.5 sm:py-2 font-extrabold rounded-xl sm:rounded-2xl flex items-center gap-1.5 sm:gap-2 text-[11px] sm:text-xs md:text-sm tracking-tight shadow-xl hover:scale-105 active:scale-95 transition cursor-pointer whitespace-nowrap shrink-0"
                            title={item.type === 'show' ? "View Episodes" : "Play"}
                            aria-label={`${item.type === 'show' ? 'View episodes for' : 'Play'} ${item.title}`}
                        >
                            <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-black text-black" />
                            <span>{item.type === 'show' ? 'View Episodes' : 'Play'}</span>
                        </button>

                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic('light');
                                onClick();
                            }}
                            className="liquid-btn-secondary px-2.5 sm:px-3.5 md:px-4 py-1.5 sm:py-2 font-bold rounded-xl sm:rounded-2xl flex items-center gap-1.5 text-[11px] sm:text-xs md:text-sm tracking-tight shadow-md hover:scale-105 active:scale-95 transition cursor-pointer whitespace-nowrap shrink-0"
                            title="More Info"
                            aria-label={`More info about ${item.title}`}
                        >
                            <Info className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span>More Info</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default memo(ContentCard);
