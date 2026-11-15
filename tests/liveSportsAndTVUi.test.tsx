import { describe, it, expect } from 'vitest';
import {
  getProviderMeta,
  PROVIDER_CONFIGS,
  isIframeStream,
  getStreamResolutionBadge,
  getStreamLatencyTag,
  type Stream,
  type Match,
} from '@/app/components/LiveSports';

describe('LiveSports Provider Branding & Configurations', () => {
  it('correctly maps PPV.st provider key and styles', () => {
    const meta = getProviderMeta('ppv');
    expect(meta.key).toBe('ppv');
    expect(meta.label).toBe('PPV.st');
    expect(meta.badgeBg).toContain('amber');
    expect(meta.badgeText).toContain('amber');
    expect(meta.dotColor).toContain('amber');

    const metaDomain = getProviderMeta('ppv.st');
    expect(metaDomain.key).toBe('ppv');
  });

  it('correctly maps StrmFree provider key and styles', () => {
    const meta = getProviderMeta('strmfree');
    expect(meta.key).toBe('strmfree');
    expect(meta.label).toBe('StrmFree');
    expect(meta.badgeBg).toContain('cyan');
    expect(meta.badgeText).toContain('cyan');
    expect(meta.dotColor).toContain('cyan');

    const metaPk = getProviderMeta('strmfree.pk');
    expect(metaPk.key).toBe('strmfree');
  });

  it('correctly maps Tim-Streams provider key and styles', () => {
    const meta = getProviderMeta('timstreams');
    expect(meta.key).toBe('timstreams');
    expect(meta.label).toBe('Tim-Streams');
    expect(meta.badgeBg).toContain('emerald');
    expect(meta.badgeText).toContain('emerald');
    expect(meta.dotColor).toContain('emerald');

    const metaDash = getProviderMeta('tim-streams');
    expect(metaDash.key).toBe('timstreams');
  });

  it('correctly maps PitSport provider key and styles', () => {
    const meta = getProviderMeta('pitsport');
    expect(meta.key).toBe('pitsport');
    expect(meta.label).toBe('PitSport');
    expect(meta.badgeBg).toContain('rose');
    expect(meta.badgeText).toContain('rose');
    expect(meta.dotColor).toContain('rose');

    const metaSt = getProviderMeta('pitsport.st');
    expect(metaSt.key).toBe('pitsport');
  });

  it('provides safe fallback for unknown sources', () => {
    const meta = getProviderMeta('unknown-custom');
    expect(meta.key).toBe('other');
    expect(meta.label).toBe('UNKNOWN-CUSTOM');
  });
});

describe('Stream Resolution & Quality Tagging', () => {
  it('identifies 4K UHD streams', () => {
    const s1: Stream = { id: '1', streamNo: 1, language: 'English 4K UHD', hd: true, is4k: true, source: 'ppv' };
    expect(getStreamResolutionBadge(s1).label).toBe('4K UHD');

    const s2: Stream = { id: '2', streamNo: 2, language: 'Spanish 2160p', hd: true, is4k: false, source: 'strmfree' };
    expect(getStreamResolutionBadge(s2).label).toBe('4K UHD');
  });

  it('identifies 1080p FHD streams', () => {
    const s1: Stream = { id: '1', streamNo: 1, language: 'Main Feed 1080p', hd: true, is4k: false, source: 'timstreams' };
    expect(getStreamResolutionBadge(s1).label).toBe('1080p FHD');

    const s2: Stream = { id: '2', streamNo: 2, language: 'FHD HEVC', hd: true, is4k: false, source: 'pitsport' };
    expect(getStreamResolutionBadge(s2).label).toBe('1080p FHD');
  });

  it('identifies 720p HD streams', () => {
    const s1: Stream = { id: '1', streamNo: 1, language: 'HD 720p', hd: true, is4k: false, source: 'strmfree' };
    expect(getStreamResolutionBadge(s1).label).toBe('720p HD');
  });

  it('categorizes latency and stream delivery type', () => {
    const directHls: Stream = { id: '1', streamNo: 1, language: 'Direct', hd: true, embedUrl: 'https://cdn.example.com/live/stream.m3u8', source: 'timstreams' };
    expect(getStreamLatencyTag(directHls).label).toBe('Direct HLS');

    const cdnStream: Stream = { id: '2', streamNo: 2, language: 'CDN', hd: true, embedUrl: 'https://ehgembxe.cfd/embed/1234', source: 'timstreams' };
    expect(getStreamLatencyTag(cdnStream).label).toBe('Fast CDN');

    const ppvStream: Stream = { id: '3', streamNo: 3, language: 'PPV Live', hd: true, embedUrl: 'https://ppv.st/player/live-1', source: 'ppv' };
    expect(getStreamLatencyTag(ppvStream).label).toBe('Low Latency');
  });
});

describe('isIframeStream detection', () => {
  it('returns true for web embed players and portal iframes', () => {
    expect(isIframeStream('https://ehgembxe.cfd/embed/live-event-1')).toBe(true);
    expect(isIframeStream('https://ppv.st/embed/sports/1234')).toBe(true);
    expect(isIframeStream('https://strmfree.pk/embed/sports/ch-1')).toBe(true);
    expect(isIframeStream('https://pitsport.st/play/live.html')).toBe(true);
    expect(isIframeStream('https://player.cdn.com/iframe?id=abc')).toBe(true);
  });

  it('returns false for direct .m3u8 HLS streams', () => {
    expect(isIframeStream('https://tims-001.sytes.net/main/secure/ch1.m3u8')).toBe(false);
    expect(isIframeStream('/api/sports/streams/resolve?id=xyz&ext=.m3u8')).toBe(false);
    expect(isIframeStream('https://streaming.example.com/hls/live/index.m3u8?token=123')).toBe(false);
  });

  it('returns false for null or empty URLs', () => {
    expect(isIframeStream(null)).toBe(false);
    expect(isIframeStream('')).toBe(false);
  });
});
