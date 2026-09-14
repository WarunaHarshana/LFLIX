/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';

vi.mock('@/app/components/VideoPlayer', () => ({
  default: function MockVideoPlayer(props: any) {
    React.useEffect(() => {
      props.onPlaybackReady?.();
    }, [props]);
    return <div data-testid="mock-video-player" data-src={props.src} data-title={props.title} />;
  },
}));

vi.mock('@/app/components/ThemeProvider', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

vi.mock('@/app/hooks/useModalBehavior', () => ({
  useModalBehavior: vi.fn(),
}));

import StreamServerModal from '@/app/components/StreamServerModal';

describe('StreamServerModal Progressive Stream Loading', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    cleanup();
  });

  it('starts playback immediately via fast=1 Cinejoy probe and merges full servers later without interrupting playback', async () => {
    const fetchCalls: string[] = [];

    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCalls.push(url);

      if (url.includes('fast=1')) {
        // Fast probe returns Cinejoy Lisbon in ~200ms
        return new Response(
          JSON.stringify({
            servers: [
              {
                id: 'cinejoy-lisbon',
                name: 'Cinejoy (Lisbon 4K)',
                url: '/api/stream-servers/proxy?url=https%3A%2F%2Finfo.movieboxnoob.cc%2Fplaylist%2Ftest.m3u8',
                color: '#10b981',
                order: -95,
                isReachable: true,
                availabilityState: 'reachable',
                probeError: null,
                probeCheckedAt: new Date().toISOString(),
                qualityHint: '2160p',
                confidence: 1.0,
                probeState: 'cached',
                lastCheckedAt: new Date().toISOString(),
                latencyMs: 45,
                isDirect: true,
                tier: 'best',
              },
            ],
            bestServerIndex: 0,
            progressive: true,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Full probe finishes slower (e.g. 50ms in mock) with additional third-party embed servers
      await new Promise((resolve) => setTimeout(resolve, 50));
      return new Response(
        JSON.stringify({
          servers: [
            {
              id: 'cinejoy-lisbon',
              name: 'Cinejoy (Lisbon 4K)',
              url: '/api/stream-servers/proxy?url=https%3A%2F%2Finfo.movieboxnoob.cc%2Fplaylist%2Ftest.m3u8',
              color: '#10b981',
              order: -95,
              isReachable: true,
              availabilityState: 'reachable',
              probeError: null,
              probeCheckedAt: new Date().toISOString(),
              qualityHint: '2160p',
              confidence: 1.0,
              probeState: 'cached',
              lastCheckedAt: new Date().toISOString(),
              latencyMs: 45,
              isDirect: true,
              tier: 'best',
            },
            {
              id: 'vidsrc',
              name: 'VidSrc',
              url: 'https://vidsrc.example/embed',
              color: '#3b82f6',
              order: 1,
              isReachable: true,
              availabilityState: 'reachable',
              probeError: null,
              probeCheckedAt: new Date().toISOString(),
              qualityHint: '1080p',
              confidence: 0.9,
              probeState: 'fast',
              lastCheckedAt: new Date().toISOString(),
              latencyMs: 300,
              isDirect: false,
              tier: 'great',
            },
          ],
          bestServerIndex: 0,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    render(
      <StreamServerModal
        tmdbId={872585}
        type="movie"
        title="Oppenheimer"
        onClose={vi.fn()}
      />
    );

    // Verify fast probe was requested
    expect(fetchCalls.some((c) => c.includes('fast=1'))).toBe(true);

    // Initial direct playback starts on Cinejoy Lisbon immediately
    await waitFor(() => {
      const player = screen.getByTestId('mock-video-player');
      expect(player).toBeTruthy();
      expect(player.getAttribute('data-src')).toContain('info.movieboxnoob.cc');
    });

    // When full probe resolves later, verify VidSrc backup was merged
    await waitFor(() => {
      expect(fetchCalls.some((c) => !c.includes('fast=1'))).toBe(true);
    });

    // Ensure player is STILL playing Cinejoy Lisbon (did not reset or abort)
    const playerAfterMerge = screen.getByTestId('mock-video-player');
    expect(playerAfterMerge.getAttribute('data-src')).toContain('info.movieboxnoob.cc');
  });
});
