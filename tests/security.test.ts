import { describe, expect, it } from 'vitest';
import path from 'path';
import {
  isPathInside,
  isPathInsideAny,
  parsePositiveInt,
  sanitizeFilename,
  validateHttpDownloadUrl,
  validatePlayerExecutable,
} from '@/lib/security';

describe('parsePositiveInt', () => {
  it('accepts positive integers as number or string', () => {
    expect(parsePositiveInt(5)).toBe(5);
    expect(parsePositiveInt('42')).toBe(42);
  });

  it('rejects zero, negatives, fractions and junk', () => {
    for (const input of [0, -1, 1.5, 'abc', '', null, undefined, {}, []]) {
      expect(parsePositiveInt(input), String(input)).toBeNull();
    }
  });

  it('rejects NaN and Infinity', () => {
    expect(parsePositiveInt(Number.NaN)).toBeNull();
    expect(parsePositiveInt(Number.POSITIVE_INFINITY)).toBeNull();
  });
});

describe('isPathInside', () => {
  const parent = path.resolve('/media/movies');

  it('accepts the directory itself and its descendants', () => {
    expect(isPathInside(parent, parent)).toBe(true);
    expect(isPathInside(path.join(parent, 'Dune.mkv'), parent)).toBe(true);
    expect(isPathInside(path.join(parent, 'a', 'b', 'c.mkv'), parent)).toBe(true);
  });

  it('rejects traversal escapes', () => {
    expect(isPathInside(path.join(parent, '..', 'secrets.txt'), parent)).toBe(false);
    expect(isPathInside(path.resolve('/etc/passwd'), parent)).toBe(false);
  });

  it('is not fooled by a sibling that shares a name prefix', () => {
    // A naive startsWith() check would wrongly accept "/media/movies-private".
    expect(isPathInside(path.resolve('/media/movies-private/x.mkv'), parent)).toBe(false);
  });
});

describe('isPathInsideAny', () => {
  const roots = [path.resolve('/media/movies'), path.resolve('/media/tv')];

  it('accepts a child of any configured root', () => {
    expect(isPathInsideAny(path.resolve('/media/tv/show/ep.mkv'), roots)).toBe(true);
  });

  it('rejects paths outside every root', () => {
    expect(isPathInsideAny(path.resolve('/media/other/x.mkv'), roots)).toBe(false);
  });

  it('rejects everything when no roots are configured', () => {
    expect(isPathInsideAny(path.resolve('/media/tv/x.mkv'), [])).toBe(false);
  });
});

describe('sanitizeFilename', () => {
  it('strips directory components', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('/tmp/evil.sh')).toBe('evil.sh');
  });

  it('replaces characters outside the safe set', () => {
    expect(sanitizeFilename('my movie:v2?.mkv')).toBe('my_movie_v2_.mkv');
  });

  it('falls back when nothing usable survives', () => {
    expect(sanitizeFilename('')).toBe('download');
    expect(sanitizeFilename('', 'fallback.bin')).toBe('fallback.bin');
  });

  it('keeps dots, dashes and underscores', () => {
    expect(sanitizeFilename('The.Movie-2021_final.mkv')).toBe('The.Movie-2021_final.mkv');
  });
});

describe('validatePlayerExecutable', () => {
  it('rejects empty, non-string and null-byte input', () => {
    expect(validatePlayerExecutable('').valid).toBe(false);
    expect(validatePlayerExecutable(undefined).valid).toBe(false);
    expect(validatePlayerExecutable(42).valid).toBe(false);
    expect(validatePlayerExecutable('C:\\vlc\0.exe').valid).toBe(false);
  });

  it('rejects a path that does not exist', () => {
    const result = validatePlayerExecutable(path.resolve('/nonexistent/vlc.exe'));
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('rejects a real file that is not a recognised player', () => {
    // Use a file guaranteed to exist in the repo.
    const result = validatePlayerExecutable(path.resolve('package.json'));
    expect(result.valid).toBe(false);
  });

  it('rejects a directory', () => {
    expect(validatePlayerExecutable(path.resolve('lib')).valid).toBe(false);
  });
});

describe('validateHttpDownloadUrl', () => {
  it('rejects non-http protocols', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://host/f', 'magnet:?xt=urn:btih:abc']) {
      expect((await validateHttpDownloadUrl(url)).url, url).toBeNull();
    }
  });

  it('rejects embedded credentials', async () => {
    const result = await validateHttpDownloadUrl('https://user:pass@example.com/f.mkv');
    expect(result.url).toBeNull();
    expect(result.error).toMatch(/credential/i);
  });

  it('rejects empty, oversized and null-byte input', async () => {
    expect((await validateHttpDownloadUrl('')).url).toBeNull();
    expect((await validateHttpDownloadUrl(null)).url).toBeNull();
    expect((await validateHttpDownloadUrl('https://a.com/' + 'x'.repeat(5000))).url).toBeNull();
    expect((await validateHttpDownloadUrl('https://a.com/\0')).url).toBeNull();
  });

  it('blocks SSRF targets on the loopback and private ranges', async () => {
    for (const url of [
      'http://localhost/admin',
      'http://127.0.0.1/admin',
      'http://10.0.0.5/x',
      'http://192.168.1.1/x',
      'http://172.16.0.1/x',
      'http://169.254.169.254/latest/meta-data',
      'http://[::1]/x',
    ]) {
      const result = await validateHttpDownloadUrl(url);
      expect(result.url, url).toBeNull();
      expect(result.error, url).toMatch(/private or local/i);
    }
  });

  it('blocks 0.0.0.0 and multicast space', async () => {
    expect((await validateHttpDownloadUrl('http://0.0.0.0/x')).url).toBeNull();
    expect((await validateHttpDownloadUrl('http://224.0.0.1/x')).url).toBeNull();
  });
});
