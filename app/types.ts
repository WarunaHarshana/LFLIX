// Shared types for LFLIX app

export type ContentItem = {
  id: number;
  type: 'movie' | 'show';
  title: string;
  logoPath?: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  year?: number;
  firstAirDate?: string | null;
  rating: number | null;
  filePath?: string;
  isHDR?: boolean;
  resolution?: string | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  audioChannels?: string | null;
  genres?: string | null;
  tmdbId?: number | null;
  addedAt?: string;
  watchProgress?: {
    progress: number;
    duration: number;
    completed: number;
  };
};

export type Season = {
  season: number;
  episodes: Episode[];
};

export type Episode = {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  filePath: string;
  overview?: string | null;
  stillPath?: string | null;
  rating?: number | null;
  isHDR?: boolean;
  resolution?: string | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  audioChannels?: string | null;
  watchProgress?: {
    progress: number;
    duration: number;
    completed: number;
  };
};

export type ContinueItem = {
  id: number;
  contentType: 'movie' | 'show';
  contentId: number;
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  progress: number;
  duration: number;
  filePath?: string;
  episodeFilePath?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeTitle?: string;
};

export type IPTVChannel = {
  id: number;
  name: string;
  url: string;
  logo?: string;
  category: string;
  country?: string;
  language?: string;
};

export type DiscoverOnlineItem = {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  rating: number | null;
  year: string | null;
  popularity: number;
};

export type TabId = 'all' | 'movie' | 'show' | 'live' | 'watchlist' | 'discover';

export const VALID_TABS: TabId[] = ['all', 'movie', 'show', 'live', 'watchlist', 'discover'];

export function isValidTab(value: string | null): value is TabId {
  return value !== null && VALID_TABS.includes(value as TabId);
}
