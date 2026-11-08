import { describe, expect, it, vi } from 'vitest';
import { GET, HEAD } from '@/app/api/torrent-stream/video/route';
import { torrentStreamManager } from '@/lib/torrentStreamer';
import { Readable } from 'stream';

describe('/api/torrent-stream/video route', () => {
  it('returns 400 when infoHash parameter is missing', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream/video', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing infoHash');
  });

  it('returns 404 when requested stream file does not exist', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream/video?infoHash=nonexistent123', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it('returns 200 with full length when no range header is supplied', async () => {
    const mockFile = {
      name: 'movie.mp4',
      length: 1000,
      createReadStream: () => Readable.from(Buffer.alloc(1000)),
    };

    const getFileSpy = vi.spyOn(torrentStreamManager, 'getFile').mockReturnValue({
      file: mockFile,
      torrent: {} as any,
    });

    const req = new Request('http://localhost:3000/api/torrent-stream/video?infoHash=mock123&fileIndex=0', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('video/mp4');
    expect(res.headers.get('Content-Length')).toBe('1000');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');

    getFileSpy.mockRestore();
  });

  it('returns 206 with byte range when range header is present', async () => {
    const mockFile = {
      name: 'movie.mp4',
      length: 1000,
      createReadStream: vi.fn().mockReturnValue(Readable.from(Buffer.alloc(100))),
    };

    const getFileSpy = vi.spyOn(torrentStreamManager, 'getFile').mockReturnValue({
      file: mockFile,
      torrent: {} as any,
    });

    const req = new Request('http://localhost:3000/api/torrent-stream/video?infoHash=mock123&fileIndex=0', {
      method: 'GET',
      headers: { range: 'bytes=0-99' },
    });

    const res = await GET(req);
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-99/1000');
    expect(res.headers.get('Content-Length')).toBe('100');
    expect(mockFile.createReadStream).toHaveBeenCalledWith({ start: 0, end: 99 });

    getFileSpy.mockRestore();
  });

  it('streams WebTorrent streamx stream without throwing init.highWaterMark TypeError', async () => {
    // WebTorrent uses streamx.Readable, which lacks Node Readable internal states
    const asyncStreamxMock = {
      async *[Symbol.asyncIterator]() {
        yield Buffer.from('streamx-video-bytes');
      },
      destroy: vi.fn(),
    };

    const mockFile = {
      name: 'bigbuckbunny.mp4',
      length: 1000,
      createReadStream: vi.fn().mockReturnValue(asyncStreamxMock),
    };

    const getFileSpy = vi.spyOn(torrentStreamManager, 'getFile').mockReturnValue({
      file: mockFile,
      torrent: {} as any,
    });

    const req = new Request('http://localhost:3000/api/torrent-stream/video?infoHash=mock123&fileIndex=0', {
      method: 'GET',
      headers: { range: 'bytes=0-18' },
    });

    const res = await GET(req);
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 0-18/1000');
    expect(res.headers.get('Content-Length')).toBe('19');

    const bodyText = await res.text();
    expect(bodyText).toBe('streamx-video-bytes');

    getFileSpy.mockRestore();
  });

  it('handles HEAD requests returning headers without streaming body', async () => {
    const mockFile = {
      name: 'episode.mkv',
      length: 5000000,
    };

    const getFileSpy = vi.spyOn(torrentStreamManager, 'getFile').mockReturnValue({
      file: mockFile,
      torrent: {} as any,
    });

    const req = new Request('http://localhost:3000/api/torrent-stream/video?infoHash=mock123&fileIndex=0', {
      method: 'HEAD',
    });

    const res = await HEAD(req);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('video/x-matroska');
    expect(res.headers.get('Content-Length')).toBe('5000000');

    getFileSpy.mockRestore();
  });
});
