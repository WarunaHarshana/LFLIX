import { describe, expect, it } from 'vitest';
import {
  isAllowedCinejoyHost,
  registerAllowedCinejoyHost,
  rewriteM3u8Playlist,
} from '@/lib/cinejoy';

describe('Cinejoy Host Validation', () => {
  it('allows trusted Cinejoy CDN domains and subdomains', () => {
    expect(isAllowedCinejoyHost('info.movieboxnoob.cc')).toBe(true);
    expect(isAllowedCinejoyHost('lol.movieboxnoob.cc')).toBe(true);
    expect(isAllowedCinejoyHost('movieboxnoob.cc')).toBe(true);
    expect(isAllowedCinejoyHost('nebula.bright67.online')).toBe(true);
    expect(isAllowedCinejoyHost('api.shegu.st')).toBe(true);
    expect(isAllowedCinejoyHost('cinejoy.to')).toBe(true);
  });

  it('rejects unapproved external hosts', () => {
    expect(isAllowedCinejoyHost('evil.com')).toBe(false);
    expect(isAllowedCinejoyHost('malicious-site.org')).toBe(false);
    expect(isAllowedCinejoyHost('169.254.169.254')).toBe(false);
    expect(isAllowedCinejoyHost('localhost')).toBe(false);
  });

  it('supports dynamically registered stream hosts', () => {
    const dynamicHost = 'stream-cdn-xyz.example-network.net';
    expect(isAllowedCinejoyHost(dynamicHost)).toBe(false);

    registerAllowedCinejoyHost(`https://${dynamicHost}/playlist.m3u8`);
    expect(isAllowedCinejoyHost(dynamicHost)).toBe(true);
  });
});

describe('rewriteM3u8Playlist', () => {
  it('rewrites master playlist sub-stream and media URIs to proxy URLs', () => {
    const manifestUrl = 'https://info.movieboxnoob.cc/playlist/test.m3u8';
    const sampleMaster = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="Track 1",DEFAULT=YES,URI="https://info.movieboxnoob.cc/hls/audio_1.m3u8"
#EXT-X-STREAM-INF:BANDWIDTH=6000000,RESOLUTION=1920x1080,AUDIO="audio"
https://info.movieboxnoob.cc/video/video_1080p.m3u8`;

    const rewritten = rewriteM3u8Playlist(sampleMaster, manifestUrl);

    expect(rewritten).toContain('#EXTM3U');
    expect(rewritten).toContain('#EXT-X-VERSION:7');
    expect(rewritten).toContain(
      'URI="/api/stream-servers/proxy?url=https%3A%2F%2Finfo.movieboxnoob.cc%2Fhls%2Faudio_1.m3u8"'
    );
    expect(rewritten).toContain(
      '/api/stream-servers/proxy?url=https%3A%2F%2Finfo.movieboxnoob.cc%2Fvideo%2Fvideo_1080p.m3u8'
    );
  });

  it('rewrites chunk playlists with relative paths and init maps', () => {
    const manifestUrl = 'https://info.movieboxnoob.cc/video/master.m3u8';
    const samplePlaylist = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-MAP:URI="init.mp4"
#EXTINF:6.000,
seg-0.m4s
#EXTINF:6.000,
seg-1.m4s`;

    const rewritten = rewriteM3u8Playlist(samplePlaylist, manifestUrl);

    expect(rewritten).toContain(
      'URI="/api/stream-servers/proxy?url=https%3A%2F%2Finfo.movieboxnoob.cc%2Fvideo%2Finit.mp4"'
    );
    expect(rewritten).toContain(
      '/api/stream-servers/proxy?url=https%3A%2F%2Finfo.movieboxnoob.cc%2Fvideo%2Fseg-0.m4s'
    );
    expect(rewritten).toContain(
      '/api/stream-servers/proxy?url=https%3A%2F%2Finfo.movieboxnoob.cc%2Fvideo%2Fseg-1.m4s'
    );
  });
});
