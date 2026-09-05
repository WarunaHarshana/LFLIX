/**
 * @vitest-environment jsdom
 */
import { afterEach, test, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, waitFor } from '@testing-library/react';

// Mock hls.js
const mockAttachMedia = vi.fn();
const mockLoadSource = vi.fn();
const mockOn = vi.fn();
const mockDestroy = vi.fn();
const mockHlsConstructor = vi.fn().mockImplementation(() => ({
  attachMedia: mockAttachMedia,
  loadSource: mockLoadSource,
  on: mockOn,
  destroy: mockDestroy,
}));

let isHlsSupportedMock = vi.fn().mockReturnValue(true);

vi.mock('hls.js', () => {
  const HlsMock: any = function (config: any) {
    return mockHlsConstructor(config);
  };
  HlsMock.isSupported = () => isHlsSupportedMock();
  HlsMock.Events = {
    MANIFEST_PARSED: 'hlsManifestParsed',
    LEVEL_SWITCHED: 'hlsLevelSwitched',
    ERROR: 'hlsError',
  };
  HlsMock.ErrorTypes = {
    NETWORK_ERROR: 'networkError',
    MEDIA_ERROR: 'mediaError',
    OTHER_ERROR: 'otherError',
  };
  return {
    default: HlsMock,
  };
});

// Mock capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
  },
}));

vi.mock('capacitor-video-player', () => ({
  CapacitorVideoPlayer: {},
}));

vi.mock('@/lib/mobileConfig', () => ({
  getServerUrl: () => 'http://192.168.1.11:3000',
}));

import VideoPlayer from '@/app/components/VideoPlayer';

describe('VideoPlayer HLS prioritization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isHlsSupportedMock.mockReturnValue(true);
    // Simulate Android Chrome where canPlayType returns 'maybe'
    HTMLMediaElement.prototype.canPlayType = vi.fn().mockImplementation((type: string) => {
      if (type === 'application/vnd.apple.mpegurl') return 'maybe';
      return '';
    });
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();
    HTMLMediaElement.prototype.load = vi.fn();
  });

  afterEach(() => {
    cleanup();
  });

  it('prioritizes hls.js (MSE) over native HLS when Hls.isSupported() is true on Android Chrome', async () => {
    render(
      <VideoPlayer
        title="DC"
        src='/api/stream?contentType=movie&contentId=628'
        fileName='DC (2026).mkv'
        videoCodec='hevc'
        audioCodec='eac3'
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockHlsConstructor).toHaveBeenCalled();
      expect(mockLoadSource).toHaveBeenCalledWith(expect.stringContaining('/api/transcode'));
      expect(mockAttachMedia).toHaveBeenCalled();
    });
  });

  it('falls back to native HLS when Hls.isSupported() is false (e.g. iOS Safari)', async () => {
    isHlsSupportedMock.mockReturnValue(false);

    const { container } = render(
      <VideoPlayer
        title="DC"
        src='/api/stream?contentType=movie&contentId=628'
        fileName='DC (2026).mkv'
        videoCodec='hevc'
        audioCodec='eac3'
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      const video = container.querySelector('video');
      expect(video).toBeTruthy();
      expect(video?.src).toContain('/api/transcode');
    });

    expect(mockHlsConstructor).not.toHaveBeenCalled();
  });
});
