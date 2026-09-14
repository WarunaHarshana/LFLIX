/**
 * @vitest-environment jsdom
 */
import { afterEach, test, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, render, waitFor, fireEvent } from '@testing-library/react';

// Mock hls.js
const mockAttachMedia = vi.fn();
const mockLoadSource = vi.fn();
const mockOn = vi.fn();
const mockDestroy = vi.fn();
const mockStartLoad = vi.fn();
const mockRecoverMediaError = vi.fn();
const mockSwapAudioCodec = vi.fn();
const mockHlsConstructor = vi.fn().mockImplementation(() => ({
  attachMedia: mockAttachMedia,
  loadSource: mockLoadSource,
  on: mockOn,
  destroy: mockDestroy,
  startLoad: mockStartLoad,
  recoverMediaError: mockRecoverMediaError,
  swapAudioCodec: mockSwapAudioCodec,
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

import VideoPlayer, { parseWebVTT } from '@/app/components/VideoPlayer';

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

  it('passes startPosition and tuned 0ms retry delay into Hls config for instant seeking', async () => {
    render(
      <VideoPlayer
        title="DC"
        src='https://proxy.example/stream.m3u8'
        initialTime={150}
        onClose={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(mockHlsConstructor).toHaveBeenCalledWith(
        expect.objectContaining({
          startPosition: 150,
          fragLoadPolicy: expect.objectContaining({
            default: expect.objectContaining({
              timeoutRetry: expect.objectContaining({
                retryDelayMs: 0,
                maxRetryDelayMs: 0,
              }),
            }),
          }),
        })
      );
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

  it('triggers onFatalError after fatal network errors exceed retry threshold', async () => {
    let errorHandler: any = null;
    mockOn.mockImplementation((event: string, callback: any) => {
      if (event === 'hlsError') {
        errorHandler = callback;
      }
    });

    const onFatalErrorMock = vi.fn();
    render(
      <VideoPlayer
        title="Test Stream"
        src="https://proxy.example/stream.m3u8"
        onClose={vi.fn()}
        onFatalError={onFatalErrorMock}
      />
    );

    await waitFor(() => {
      expect(errorHandler).toBeTruthy();
    });

    // Fire fatal network error 3 times
    errorHandler('hlsError', { fatal: true, type: 'networkError' });
    errorHandler('hlsError', { fatal: true, type: 'networkError' });
    errorHandler('hlsError', { fatal: true, type: 'networkError' });

    expect(onFatalErrorMock).toHaveBeenCalledWith('hls-network-fatal');
    expect(mockDestroy).toHaveBeenCalled();
  });

  it('triggers onPlaybackReady when manifest is parsed', async () => {
    let manifestHandler: any = null;
    mockOn.mockImplementation((event: string, callback: any) => {
      if (event === 'hlsManifestParsed') {
        manifestHandler = callback;
      }
    });

    const onPlaybackReadyMock = vi.fn();
    render(
      <VideoPlayer
        title="Test Stream"
        src="https://proxy.example/stream.m3u8"
        onClose={vi.fn()}
        onPlaybackReady={onPlaybackReadyMock}
      />
    );

    await waitFor(() => {
      expect(manifestHandler).toBeTruthy();
    });

    manifestHandler('hlsManifestParsed', {
      levels: [
        { height: 2160, bitrate: 15000000 },
        { height: 1080, bitrate: 5000000 },
      ],
    });

    expect(onPlaybackReadyMock).toHaveBeenCalled();
  });

  it('hides the external player button when hideExternalPlayer is true', () => {
    const { queryByText, queryByLabelText } = render(
      <VideoPlayer
        title="Test Stream"
        src="https://proxy.example/stream.m3u8"
        hideExternalPlayer={true}
        onClose={vi.fn()}
      />
    );

    expect(queryByText(/Play in VLC\/MPV/i)).toBeNull();
    expect(queryByLabelText(/Play in MPV \/ VLC/i)).toBeNull();
  });

  it('renders subtitle appearance controls and applies custom cue styles', async () => {
    const { getByLabelText, getByText, findByText, container } = render(
      <VideoPlayer
        title="Test Stream"
        src="https://proxy.example/stream.m3u8"
        subtitles={[{ label: 'English', url: 'https://proxy.example/sub.vtt', language: 'en' }]}
        onClose={vi.fn()}
      />
    );

    // Open settings modal
    const settingsBtn = getByLabelText(/Audio and Subtitles/i);
    fireEvent.click(settingsBtn);

    // Wait for modal and click Subtitles tab
    const subTab = await findByText('Subtitles');
    fireEvent.click(subTab);

    // Verify appearance controls exist
    expect(await findByText(/Subtitle Appearance/i)).toBeTruthy();
    expect(getByText(/Sample Subtitle Text/i)).toBeTruthy();
    expect(getByText(/Inter/i)).toBeTruthy();
    expect(getByText(/Cinema/i)).toBeTruthy();
    expect(getByText(/Montserrat/i)).toBeTruthy();
    expect(getByText(/Dark Background Box/i)).toBeTruthy();

    // Verify player container has lflix-player-container class and cue style tag
    const playerContainer = container.querySelector('.lflix-player-container');
    expect(playerContainer).toBeTruthy();
    const styleTag = playerContainer?.querySelector('style');
    expect(styleTag?.textContent).toContain('.lflix-player-container video::cue');
  });

  it('correctly parses WebVTT cues from string', () => {
    const vtt = `WEBVTT

1
00:01:20.500 --> 00:01:25.000
<i>Welcome</i> to the show!
Second line of text

2
00:02:00,100 --> 00:02:03,400
Another line of subtitles`;

    const cues = parseWebVTT(vtt);
    expect(cues).toHaveLength(2);
    expect(cues[0].start).toBeCloseTo(80.5);
    expect(cues[0].end).toBeCloseTo(85.0);
    expect(cues[0].text).toBe('Welcome to the show!\nSecond line of text');
    expect(cues[1].start).toBeCloseTo(120.1);
    expect(cues[1].end).toBeCloseTo(123.4);
    expect(cues[1].text).toBe('Another line of subtitles');
  });

  it('renders active cues in the custom subtitle overlay during playback', async () => {
    const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:05.000
Active Subtitle Text In Overlay`;

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => vtt,
    } as any);

    try {
      const { findByText, container } = render(
        <VideoPlayer
          title="Test Stream"
          src="https://proxy.example/stream.m3u8"
          subtitles={[{ label: 'English', url: 'https://proxy.example/sub.vtt', language: 'en' }]}
          onClose={vi.fn()}
        />
      );

      // Simulate video playing at 2 seconds (within cue 1s - 5s)
      const video = container.querySelector('video');
      expect(video).toBeTruthy();
      if (video) {
        Object.defineProperty(video, 'currentTime', { value: 2, writable: true });
        fireEvent.timeUpdate(video);
      }

      // Verify the active cue appears in the overlay
      expect(await findByText(/Active Subtitle Text In Overlay/i)).toBeTruthy();
    } finally {
      global.fetch = originalFetch;
    }
  });
});

