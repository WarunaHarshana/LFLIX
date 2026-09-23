'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import TitleDetailPage, { type ContentItem } from '@/app/components/TitleDetailPage';
import { usePlayback } from '@/app/hooks/usePlayback';
import { useToast } from '@/app/hooks/useToast';
import VideoPlayer from '@/app/components/VideoPlayer';

export default function TitleDetailRoutePage() {
  const router = useRouter();
  const params = useParams<{ type: string; id: string }>();
  const { showToast } = useToast();
  const [contentItem, setContentItem] = useState<ContentItem | null>(null);
  const playback = usePlayback(contentItem ? [contentItem as any] : [], showToast);

  const rawType = params?.type;
  const mediaType: 'movie' | 'show' = rawType === 'tv' || rawType === 'show' ? 'show' : 'movie';
  const idParam = params?.id || '';
  const numId = parseInt(idParam, 10);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadItem = async () => {
      setLoading(true);
      try {
        // 1. Check local content first
        const contentRes = await fetch('/api/content');
        if (contentRes.ok) {
          const library = await contentRes.json();
          const found = (library || []).find((c: any) => {
            if (c.type !== mediaType) return false;
            return c.id === numId || c.tmdbId === numId;
          });

          if (found && !cancelled) {
            setContentItem(found);
            setLoading(false);
            return;
          }
        }

        // 2. Fallback to TMDB details
        const tmdbType = mediaType === 'show' ? 'tv' : 'movie';
        const tmdbRes = await fetch(`/api/tmdb-details?id=${numId}&type=${tmdbType}`);
        if (tmdbRes.ok && !cancelled) {
          const tmdbData = await tmdbRes.json();
          setContentItem({
            id: numId,
            tmdbId: numId,
            type: mediaType,
            title: tmdbData.title || tmdbData.name || '',
            posterPath: tmdbData.posterPath || null,
            backdropPath: tmdbData.backdropPath || null,
            overview: tmdbData.overview || null,
            genres: tmdbData.genres || null,
            rating: tmdbData.rating || null,
            imdbRating: tmdbData.imdbRating || null,
            year: tmdbData.year ? parseInt(tmdbData.year, 10) : undefined,
            firstAirDate: tmdbData.firstAirDate || null
          });
        }
      } catch (err) {
        console.error('Failed to load title route:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (numId > 0) {
      loadItem();
    } else {
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [numId, mediaType]);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white/60 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-white" />
        <span className="text-base font-medium">Loading title...</span>
      </div>
    );
  }

  if (!contentItem) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center text-white gap-4">
        <h2 className="text-2xl font-bold">Title not found</h2>
        <button
          onClick={handleBack}
          className="px-6 py-2.5 rounded-full bg-white text-black font-bold hover:bg-neutral-200 transition"
        >
          Return to Library
        </button>
      </div>
    );
  }

  return (
    <>
      <TitleDetailPage
        item={contentItem}
        isLocal={Boolean(contentItem.filePath || contentItem.addedAt || (contentItem as any).isLocal)}
        onBack={handleBack}
        onPlayLocal={(item, epId, start) => {
          playback.playFile(item.type, item.id, epId, start);
        }}
        onOpenOnline={(onlineItem) => {
          router.push(`/discover/${onlineItem.mediaType}/${onlineItem.tmdbId}`);
        }}
        onSelectSimilar={(sim) => {
          router.push(`/discover/${sim.mediaType}/${sim.tmdbId}`);
        }}
      />

      {playback.videoPlayer && (
        <VideoPlayer
          src={playback.videoPlayer.src}
          title={playback.videoPlayer.title}
          initialTime={playback.videoPlayer.initialTime}
          isHDR={playback.videoPlayer.isHDR}
          audioCodec={playback.videoPlayer.audioCodec}
          videoCodec={playback.videoPlayer.videoCodec}
          fileName={playback.videoPlayer.fileName}
          onClose={() => playback.setVideoPlayer(null)}
        />
      )}
    </>
  );
}
