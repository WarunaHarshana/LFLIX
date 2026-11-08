import { describe, expect, it } from 'vitest';
import { GET, DELETE } from '@/app/api/torrent-stream/cache/route';

describe('/api/torrent-stream/cache route', () => {
  it('returns stream cache stats on GET', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream/cache', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.cacheDir).toBe('string');
    expect(typeof data.totalSizeBytes).toBe('number');
    expect(typeof data.totalSizeFormatted).toBe('string');
    expect(typeof data.freeDiskBytes).toBe('number');
    expect(typeof data.freeDiskFormatted).toBe('string');
  });

  it('clears stream cache on DELETE and reports success', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream/cache', {
      method: 'DELETE',
    });

    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(typeof data.freedBytes).toBe('number');
  });
});
