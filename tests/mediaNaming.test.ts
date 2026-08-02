import { describe, expect, it } from 'vitest';
import {
  detectAudioCodec,
  detectHDR,
  detectResolution,
  detectTvShow,
  detectVideoCodec,
  isExtrasContent,
  isSampleClip,
  isVideoFile,
} from '@/lib/mediaNaming';

describe('isVideoFile', () => {
  it('accepts every supported container, case-insensitively', () => {
    for (const ext of ['mp4', 'mkv', 'avi', 'mov', 'm4v', 'wmv', 'flv', 'webm', 'ts']) {
      expect(isVideoFile(`Movie.${ext}`), ext).toBe(true);
      expect(isVideoFile(`Movie.${ext.toUpperCase()}`), ext.toUpperCase()).toBe(true);
    }
  });

  it('rejects subtitles, images and extensionless files', () => {
    expect(isVideoFile('Movie.srt')).toBe(false);
    expect(isVideoFile('poster.jpg')).toBe(false);
    expect(isVideoFile('README')).toBe(false);
  });

  it('does not treat a video extension in the middle of a name as a match', () => {
    expect(isVideoFile('The.mkv.Collection.nfo')).toBe(false);
  });
});

describe('detectTvShow', () => {
  it('parses the standard SxxExx form', () => {
    expect(detectTvShow('Breaking.Bad.S01E05.1080p.mkv')).toMatchObject({ season: 1, episode: 5 });
  });

  it('parses the 1x05 form', () => {
    expect(detectTvShow('Breaking Bad 1x05.mkv')).toMatchObject({ season: 1, episode: 5 });
  });

  it('parses the verbose "Season 2 Episode 3" form', () => {
    expect(detectTvShow('Show.Season.2.Episode.3.mkv')).toMatchObject({ season: 2, episode: 3 });
  });

  it('normalises dots and underscores out of the show name', () => {
    expect(detectTvShow('Breaking.Bad.S01E05.mkv')?.name).toBe('Breaking Bad');
    expect(detectTvShow('Breaking_Bad_S01E05.mkv')?.name).toBe('Breaking Bad');
  });

  it('handles multi-digit seasons and episodes', () => {
    expect(detectTvShow('Show.S10E24.mkv')).toMatchObject({ season: 10, episode: 24 });
  });

  it('returns null for a plain movie filename', () => {
    expect(detectTvShow('Inception (2010).mkv')).toBeNull();
  });

  it('prefers SxxExx over the looser bare-episode pattern', () => {
    // The bare /ep?(\d+)/ pattern is last precisely so it cannot win here.
    expect(detectTvShow('Show.S03E07.mkv')).toMatchObject({ season: 3, episode: 7 });
  });
});

describe('detectResolution', () => {
  it.each([
    ['Movie.2160p.mkv', '2160p'],
    ['Movie.4K.mkv', '2160p'],
    ['Movie.UHD.mkv', '2160p'],
    ['Movie.1080p.mkv', '1080p'],
    ['Movie.720p.mkv', '720p'],
    ['Movie.480p.mkv', '480p'],
  ])('maps %s to %s', (name, expected) => {
    expect(detectResolution(name)).toBe(expected);
  });

  it('returns null when no resolution is present', () => {
    expect(detectResolution('Movie.mkv')).toBeNull();
  });

  it('prefers the highest tier when several are present', () => {
    expect(detectResolution('Movie.2160p.upscaled.from.1080p.mkv')).toBe('2160p');
  });
});

describe('detectHDR', () => {
  it.each(['Movie.HDR.mkv', 'Movie.HDR10.mkv', 'Movie.HDR10+.mkv', 'Movie.Dolby.Vision.mkv', 'Movie.DoVi.mkv', 'Movie.HLG.mkv'])(
    'flags %s as HDR',
    (name) => expect(detectHDR(name)).toBe(true)
  );

  it('does not flag plain SDR releases', () => {
    expect(detectHDR('Movie.1080p.x264.mkv')).toBe(false);
  });
});

describe('detectVideoCodec', () => {
  it.each([
    ['Movie.x265.mkv', 'HEVC'],
    ['Movie.HEVC.mkv', 'HEVC'],
    ['Movie.h265.mkv', 'HEVC'],
    ['Movie.x264.mkv', 'H.264'],
    ['Movie.H.264.mkv', 'H.264'],
    ['Movie.AV1.mkv', 'AV1'],
    ['Movie.VP9.webm', 'VP9'],
  ])('maps %s to %s', (name, expected) => {
    expect(detectVideoCodec(name)).toBe(expected);
  });

  it('returns null when the codec is not in the filename', () => {
    expect(detectVideoCodec('Movie.1080p.mkv')).toBeNull();
  });
});

describe('detectAudioCodec', () => {
  it('prefers the richest format when several are listed', () => {
    // Atmos is checked before its underlying stream, which is how these
    // releases are usually named ("TrueHD.Atmos", "DDP5.1.Atmos").
    expect(detectAudioCodec('Movie.TrueHD.Atmos.7.1.mkv').codec).toBe('Atmos');
    expect(detectAudioCodec('Movie.DDP5.1.Atmos.mkv').codec).toBe('Atmos');
  });

  it.each([
    ['Movie.TrueHD.mkv', 'TrueHD'],
    ['Movie.DTS-HD.mkv', 'DTS-HD'],
    ['Movie.DTS.mkv', 'DTS'],
    ['Movie.AC3.mkv', 'AC3'],
    ['Movie.AAC.mkv', 'AAC'],
    ['Movie.FLAC.mkv', 'FLAC'],
  ])('maps %s to %s', (name, expected) => {
    expect(detectAudioCodec(name).codec).toBe(expected);
  });

  // Regression: these are the dominant Dolby Digital Plus namings in the wild.
  // The channel layout follows the codec with no separator, so a trailing \b
  // after "DDP" silently matched nothing and the codec came back null.
  it.each([
    'Movie.DDP5.1.mkv',
    'Movie.DDP2.0.mkv',
    'Movie.DD+5.1.mkv',
    'Movie.DDP.mkv',
    'Movie.EAC3.mkv',
    'Movie.E-AC-3.mkv',
  ])('detects %s as EAC3', (name) => {
    expect(detectAudioCodec(name).codec).toBe('EAC3');
  });

  it('still reads plain DD channel layouts as AC3', () => {
    expect(detectAudioCodec('Movie.DD5.1.mkv').codec).toBe('AC3');
    expect(detectAudioCodec('Movie.DD2.0.mkv').codec).toBe('AC3');
  });

  it('extracts the channel layout', () => {
    expect(detectAudioCodec('Movie.Atmos.7.1.mkv').channels).toBe('7.1');
    expect(detectAudioCodec('Movie.AC3.5.1.mkv').channels).toBe('5.1');
    expect(detectAudioCodec('Movie.AAC.2.0.mkv').channels).toBe('2.0');
  });

  it('returns nulls when nothing is detectable', () => {
    expect(detectAudioCodec('Movie.mkv')).toEqual({ codec: null, channels: null });
  });
});

describe('isSampleClip', () => {
  it('matches a sample directory on either separator style', () => {
    expect(isSampleClip('D:\\Movies\\Inception\\Sample\\clip.mkv')).toBe(true);
    expect(isSampleClip('/media/Movies/Inception/samples/clip.mkv')).toBe(true);
  });

  it('matches a sample-suffixed filename', () => {
    expect(isSampleClip('D:\\Movies\\Inception-sample.mkv')).toBe(true);
    expect(isSampleClip('D:\\Movies\\Inception.sample.mkv')).toBe(true);
  });

  it('does not match titles that merely contain the word', () => {
    expect(isSampleClip('D:\\Movies\\Free Samples (2019).mkv')).toBe(false);
  });
});

describe('isExtrasContent', () => {
  it('matches bonus-content folders regardless of case or separator', () => {
    expect(isExtrasContent('D:\\Movies\\Dune\\Extras\\interview.mkv')).toBe(true);
    expect(isExtrasContent('/media/Dune/behind the scenes/clip.mkv')).toBe(true);
    expect(isExtrasContent('D:\\Movies\\Dune\\DELETED SCENES\\a.mkv')).toBe(true);
  });

  it('leaves the main feature alone', () => {
    expect(isExtrasContent('D:\\Movies\\Dune\\Dune (2021).mkv')).toBe(false);
  });

  it('only considers directories, never the filename itself', () => {
    expect(isExtrasContent('D:\\Movies\\trailer.mkv')).toBe(false);
  });
});
