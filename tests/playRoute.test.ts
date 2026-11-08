import { describe, expect, it } from 'vitest';
import { detectPlayerType, buildPlayerArgs } from '@/app/api/play/route';

describe('detectPlayerType', () => {
  it('detects VLC player paths', () => {
    expect(detectPlayerType('C:\\Program Files\\VideoLAN\\VLC\\vlc.exe')).toBe('vlc');
    expect(detectPlayerType('/usr/bin/vlc')).toBe('vlc');
  });

  it('detects MPV player paths', () => {
    expect(
      detectPlayerType(
        'C:\\Users\\warun\\AppData\\Local\\Microsoft\\WinGet\\Packages\\mpv-player.mpv-CI.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe\\mpv.exe'
      )
    ).toBe('mpv');
    expect(detectPlayerType('/usr/local/bin/mpv')).toBe('mpv');
  });

  it('detects PotPlayer paths', () => {
    expect(detectPlayerType('C:\\Program Files\\DAUM\\PotPlayer\\PotPlayer64.exe')).toBe('potplayer');
  });

  it('detects MPC-HC and MPC-BE paths', () => {
    expect(detectPlayerType('C:\\Program Files\\MPC-HC\\mpc-hc64.exe')).toBe('mpc');
    expect(detectPlayerType('C:\\Program Files\\MPC-BE\\mpc-be64.exe')).toBe('mpc');
  });

  it('falls back to generic for other executables', () => {
    expect(detectPlayerType('C:\\Program Files\\Windows Media Player\\wmplayer.exe')).toBe('generic');
  });
});

describe('buildPlayerArgs', () => {
  const testFile = 'E:\\Movies\\Inception (2010)\\Inception.mkv';

  it('builds MPV arguments with visibility, top-level focus, and fullscreen flags', () => {
    const args = buildPlayerArgs('mpv', testFile);
    expect(args).toContain('--fullscreen');
    expect(args).toContain('--force-window=yes');
    expect(args).toContain('--focus-on=open');
    expect(args).toContain('--ontop');
    expect(args[args.length - 1]).toBe(testFile);
  });

  it('applies seek start time to MPV arguments', () => {
    const args = buildPlayerArgs('mpv', testFile, 125.7);
    expect(args).toContain('--start=125');
    expect(args).toContain('--force-window=yes');
    expect(args[args.length - 1]).toBe(testFile);
  });

  it('builds VLC arguments with fullscreen and video-on-top flags', () => {
    const args = buildPlayerArgs('vlc', testFile);
    expect(args).toContain('--fullscreen');
    expect(args).toContain('--video-on-top');
    expect(args[args.length - 1]).toBe(testFile);
  });

  it('applies seek start time to VLC arguments', () => {
    const args = buildPlayerArgs('vlc', testFile, 90);
    expect(args).toContain('--start-time=90');
    expect(args).toContain('--video-on-top');
  });

  it('builds PotPlayer arguments with /seek HH:MM:SS', () => {
    const args = buildPlayerArgs('potplayer', testFile, 3665);
    expect(args).toContain('/seek=01:01:05');
    expect(args[0]).toBe(testFile);
  });

  it('builds MPC arguments with /fullscreen and /start in milliseconds', () => {
    const args = buildPlayerArgs('mpc', testFile, 12);
    expect(args).toContain('/fullscreen');
    expect(args).toContain('/start');
    expect(args).toContain('12000');
  });

  it('handles generic players with just file path', () => {
    const args = buildPlayerArgs('generic', testFile);
    expect(args).toEqual([testFile]);
  });

  it('builds MPV arguments with direct HTTP torrent stream URL', () => {
    const streamUrl = 'http://127.0.0.1:42069/webtorrent/abc12345/0';
    const args = buildPlayerArgs('mpv', streamUrl, 45);
    expect(args).toContain('--fullscreen');
    expect(args).toContain('--start=45');
    expect(args[args.length - 1]).toBe(streamUrl);
  });
});
