'use client';

import { memo } from 'react';
import { Film, Tv, Play } from 'lucide-react';
import TMDBImage from './TMDBImage';

type WatchProgress = {
    progress: number;
    duration: number;
    completed: number;
};

export type ContentItem = {
    id: number;
    type: 'movie' | 'show';
    title: string;
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
    watchProgress?: WatchProgress;
};

type Props = {
    item: ContentItem;
    onClick: () => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    showProgress?: boolean;
    showTitle?: boolean;
    showRating?: boolean;
};

function ContentCard({ item, onClick, onContextMenu, showProgress = true, showTitle = true, showRating = true }: Props) {
    const year = item.year || (item.firstAirDate ? item.firstAirDate.substring(0, 4) : '');
    const progressPercent = item.watchProgress && item.watchProgress.duration > 0
        ? (item.watchProgress.progress / item.watchProgress.duration) * 100
        : 0;

    return (
        <div
            onClick={onClick}
            onContextMenu={onContextMenu}
            className="group relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-[1.04] hover:z-30 liquid-card liquid-sheen-effect shadow-md hover:shadow-[0_20px_50px_rgba(0,0,0,0.8),0_0_24px_rgba(255,255,255,0.12)]"
        >
            {item.posterPath ? (
                <TMDBImage
                    src={item.posterPath}
                    alt={item.title}
                    tmdbSize="w342"
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, (max-width: 1536px) 16vw, 12vw"
                    className="w-full h-full object-cover transition duration-500 group-hover:scale-105 group-hover:brightness-90"
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

            {/* Glowing liquid progress bar */}
            {showProgress && progressPercent > 0 && progressPercent < 95 && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-black/60 backdrop-blur-sm z-20">
                    <div
                        className="h-full bg-gradient-to-r from-red-600 via-rose-500 to-amber-400 transition-all rounded-r-full shadow-[0_0_10px_rgba(244,63,94,0.8)]"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            )}

            {/* Hover overlay with liquid blur */}
            <div className="absolute inset-0 p-3.5 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/50 to-transparent backdrop-blur-[2px] z-10">
                {showTitle && <h4 className="font-bold text-white text-xs sm:text-sm line-clamp-2 drop-shadow-md leading-snug">{item.title}</h4>}
                <div className="flex justify-between items-center mt-1.5">
                    <div className="flex items-center gap-1.5 text-xs text-neutral-200 font-medium drop-shadow">
                        {item.type === 'show' ? <Tv className="w-3.5 h-3.5" /> : <Film className="w-3.5 h-3.5" />}
                        <span>{year}</span>
                    </div>
                    <div className="p-1.5 liquid-orb bg-white text-black shadow-lg">
                        <Play className="w-3 h-3 fill-black text-black" />
                    </div>
                </div>
            </div>

            {/* Watched badge as crystal pill */}
            {item.watchProgress?.completed === 1 && (
                <span className="!absolute top-2.5 right-2.5 inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-500/25 text-emerald-300 border border-emerald-400/40 text-xs rounded-full font-bold z-20 backdrop-blur-md shadow-md pointer-events-none select-none w-fit">
                    ✓ Watched
                </span>
            )}

            {/* Format tags */}
            {(() => {
                if (item.filePath === undefined) return null;
                const tags: { label: string; cls: string }[] = [];
                const fp = item.filePath.toUpperCase();
                
                if (item.resolution) {
                    tags.push({ label: item.resolution === '2160p' ? '4K' : item.resolution, cls: 'bg-blue-500/80 text-white border-blue-400/40' });
                }

                if (item.isHDR || /\bHDR\b/.test(fp))
                    tags.push({ label: /HDR10\+|HDR10PLUS/.test(fp) ? 'HDR10+' : /HDR10/.test(fp) ? 'HDR10' : 'HDR', cls: 'bg-amber-500/80 text-black border-amber-300/50' });
                if (/\bDOVI\b|\bDV\b|DOLBY.?VISION/.test(fp))
                    tags.push({ label: 'DV', cls: 'bg-fuchsia-600/80 text-white border-fuchsia-400/40' });
                if (/\bIMAX\b/.test(fp))
                    tags.push({ label: 'IMAX', cls: 'bg-cyan-500/80 text-black border-cyan-300/50' });
                if (/\bREMUX\b/.test(fp))
                    tags.push({ label: 'Remux', cls: 'bg-emerald-500/80 text-black border-emerald-300/50' });
                if (/\bATMOS\b/.test(fp))
                    tags.push({ label: 'Atmos', cls: 'bg-indigo-600/80 text-white border-indigo-400/40' });
                if (tags.length === 0 && !item.isHDR)
                    tags.push({ label: 'SDR', cls: 'bg-neutral-800/80 text-neutral-300 border-white/10' });
                return tags.length > 0 ? (
                    <div className="absolute top-2 left-2 flex flex-col gap-1 z-20 pointer-events-none">
                        {tags.map((t, i) => (
                            <span key={i} className={`px-1.5 py-0.5 text-[10px] rounded-md font-bold tracking-wider backdrop-blur-md shadow-sm border ${t.cls}`}>{t.label}</span>
                        ))}
                    </div>
                ) : null;
            })()}
        </div>
    );
}

export default memo(ContentCard);
