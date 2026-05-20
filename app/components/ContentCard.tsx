'use client';

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

export default function ContentCard({ item, onClick, onContextMenu, showProgress = true, showTitle = true, showRating = true }: Props) {
    const year = item.year || (item.firstAirDate ? item.firstAirDate.substring(0, 4) : '');
    const progressPercent = item.watchProgress && item.watchProgress.duration > 0
        ? (item.watchProgress.progress / item.watchProgress.duration) * 100
        : 0;

    return (
        <div
            onClick={onClick}
            onContextMenu={onContextMenu}
            className="group relative aspect-[2/3] bg-[var(--surface-3)] rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:scale-105 hover:z-30 hover:shadow-2xl hover:shadow-black/50 hover:ring-2 hover:ring-white/60"
        >
            {item.posterPath ? (
                <TMDBImage
                    src={item.posterPath}
                    alt={item.title}
                    tmdbSize="w500"
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, (max-width: 1536px) 16vw, 12vw"
                    className="w-full h-full object-cover transition duration-500 group-hover:brightness-75"
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

            {/* Progress bar */}
            {showProgress && progressPercent > 0 && progressPercent < 95 && (
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--border-default)]">
                    <div
                        className="h-full bg-white transition-all"
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>
            )}

            {/* Hover overlay */}
            <div className="absolute inset-0 p-4 opacity-0 group-hover:opacity-100 transition duration-300 flex flex-col justify-end bg-gradient-to-t from-[var(--overlay-strong)] to-transparent">
                {showTitle && <h4 className="font-bold text-[var(--text-primary)] text-sm line-clamp-2">{item.title}</h4>}
                <div className="flex justify-between items-center mt-2">
                    <div className="flex gap-2 text-xs text-[var(--text-secondary)]">
                        {item.type === 'show' ? <Tv className="w-3 h-3" /> : <Film className="w-3 h-3" />}
                        <span>{year}</span>
                    </div>
                    <div className="p-1.5 bg-white rounded-full">
                        <Play className="w-3 h-3 fill-black text-black" />
                    </div>
                </div>
            </div>

            {/* Watched badge */}
            {item.watchProgress?.completed === 1 && (
                <div className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-600 text-white text-xs rounded-full font-medium z-10">
                    ✓ Watched
                </div>
            )}

            {/* Format tags */}
            {(() => {
                if (item.filePath === undefined) return null;
                const tags: { label: string; cls: string }[] = [];
                const fp = item.filePath.toUpperCase();
                
                if (item.resolution) {
                    tags.push({ label: item.resolution === '2160p' ? '4K' : item.resolution, cls: 'bg-blue-500/90 text-white' });
                }

                if (item.isHDR || /\bHDR\b/.test(fp))
                    tags.push({ label: /HDR10\+|HDR10PLUS/.test(fp) ? 'HDR10+' : /HDR10/.test(fp) ? 'HDR10' : 'HDR', cls: 'bg-amber-500/90 text-black' });
                if (/\bDOVI\b|\bDV\b|DOLBY.?VISION/.test(fp))
                    tags.push({ label: 'DV', cls: 'bg-fuchsia-500/90 text-white' });
                if (/\bIMAX\b/.test(fp))
                    tags.push({ label: 'IMAX', cls: 'bg-cyan-500/90 text-black' });
                if (/\bREMUX\b/.test(fp))
                    tags.push({ label: 'Remux', cls: 'bg-emerald-500/90 text-black' });
                if (/\bATMOS\b/.test(fp))
                    tags.push({ label: 'Atmos', cls: 'bg-indigo-500/90 text-white' });
                if (tags.length === 0 && !item.isHDR)
                    tags.push({ label: 'SDR', cls: 'bg-neutral-600/80 text-neutral-200' });
                return tags.length > 0 ? (
                    <div className="absolute top-2 left-2 flex flex-col gap-1 z-10 pointer-events-none">
                        {tags.map((t, i) => (
                            <span key={i} className={`px-1.5 py-0.5 text-[10px] rounded font-bold tracking-wide backdrop-blur-sm shadow-sm ${t.cls}`}>{t.label}</span>
                        ))}
                    </div>
                ) : null;
            })()}
        </div>
    );
}
