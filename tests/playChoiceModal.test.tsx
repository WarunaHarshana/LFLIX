/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PlayChoiceModal from '@/app/components/PlayChoiceModal';
import type { PlayChoiceItem } from '@/app/hooks/usePlayback';

afterEach(() => {
  cleanup();
});

describe('PlayChoiceModal', () => {
  const sampleItem: PlayChoiceItem = {
    contentType: 'movie',
    contentId: 42,
    title: 'Interstellar',
    isHDR: true,
    videoCodec: 'hevc',
    audioCodec: 'eac3',
    fileName: 'Interstellar.2014.mkv',
    streamUrl: '/api/stream?contentType=movie&contentId=42&token=xyz123',
    token: 'xyz123',
  };

  it('renders title and media codec badges', () => {
    render(
      <PlayChoiceModal
        item={sampleItem}
        onClose={vi.fn()}
        onPlayInBrowser={vi.fn()}
        onPlayOnHostPc={vi.fn()}
        onOpenDlna={vi.fn()}
      />
    );

    expect(screen.getByText('Interstellar')).toBeTruthy();
    expect(screen.getByText('HDR')).toBeTruthy();
    expect(screen.getByText('HEVC')).toBeTruthy();
    expect(screen.getByText('EAC3')).toBeTruthy();
  });

  it('triggers onPlayInBrowser when browser player is selected', () => {
    const onPlayInBrowser = vi.fn();
    const onClose = vi.fn();

    render(
      <PlayChoiceModal
        item={sampleItem}
        onClose={onClose}
        onPlayInBrowser={onPlayInBrowser}
        onPlayOnHostPc={vi.fn()}
        onOpenDlna={vi.fn()}
      />
    );

    const browserBtn = screen.getByText('Play in Browser Player').closest('button');
    expect(browserBtn).toBeTruthy();
    fireEvent.click(browserBtn!);

    expect(onPlayInBrowser).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onPlayOnHostPc when host PC screen is selected', () => {
    const onPlayOnHostPc = vi.fn();
    const onClose = vi.fn();

    render(
      <PlayChoiceModal
        item={sampleItem}
        onClose={onClose}
        onPlayInBrowser={vi.fn()}
        onPlayOnHostPc={onPlayOnHostPc}
        onOpenDlna={vi.fn()}
      />
    );

    const hostPcBtn = screen.getByText('Play on Host PC Screen').closest('button');
    expect(hostPcBtn).toBeTruthy();
    fireEvent.click(hostPcBtn!);

    expect(onPlayOnHostPc).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onOpenDlna when smart TV cast option is selected', () => {
    const onOpenDlna = vi.fn();
    const onClose = vi.fn();

    render(
      <PlayChoiceModal
        item={sampleItem}
        onClose={onClose}
        onPlayInBrowser={vi.fn()}
        onPlayOnHostPc={vi.fn()}
        onOpenDlna={onOpenDlna}
      />
    );

    const dlnaBtn = screen.getByText('Cast to Smart TV (DLNA)').closest('button');
    expect(dlnaBtn).toBeTruthy();
    fireEvent.click(dlnaBtn!);

    expect(onOpenDlna).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape keypress', () => {
    const onClose = vi.fn();

    render(
      <PlayChoiceModal
        item={sampleItem}
        onClose={onClose}
        onPlayInBrowser={vi.fn()}
        onPlayOnHostPc={vi.fn()}
        onOpenDlna={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
