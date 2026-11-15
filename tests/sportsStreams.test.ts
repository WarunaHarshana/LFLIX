import { describe, it, expect } from 'vitest';
import { GET as getStreams } from '@/app/api/sports/streams/route';

describe('/api/sports/streams route for all 4 providers', () => {
  it('returns streams for ppv source with valid id', async () => {
    const req = new Request('http://localhost:3000/api/sports/streams?source=ppv&id=nfl-network');
    const res = await getStreams(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.streams)).toBe(true);
    if (data.streams.length > 0) {
      expect(data.streams[0].source).toBe('ppv');
      expect(data.streams[0].embedUrl).toBeTruthy();
    }
  });

  it('returns streams for strmfree source with valid stream_key', async () => {
    const req = new Request('http://localhost:3000/api/sports/streams?source=strmfree&id=montenegro-vs-cyprus');
    const res = await getStreams(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.streams)).toBe(true);
    expect(data.streams.length).toBeGreaterThan(0);
    expect(data.streams[0].source).toBe('strmfree');
  });

  it('returns streams for timstreams source with valid id', async () => {
    const req = new Request('http://localhost:3000/api/sports/streams?source=timstreams&id=ufc-334-gane-vs-hokit-ufc-600061400');
    const res = await getStreams(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.streams)).toBe(true);
    if (data.streams.length > 0) {
      expect(data.streams[0].source).toBe('timstreams');
      expect(data.streams[0].embedUrl).toContain('ehgembxe.cfd');
    }
  });

  it('returns streams for pitsport source with valid programId', async () => {
    const req = new Request('http://localhost:3000/api/sports/streams?source=pitsport&id=103182');
    const res = await getStreams(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.streams)).toBe(true);
    if (data.streams.length > 0) {
      expect(data.streams[0].source).toBe('pitsport');
      expect(data.streams[0].embedUrl).toContain('embdlol.st');
    }
  });

  it('handles invalid or missing parameters gracefully', async () => {
    const req = new Request('http://localhost:3000/api/sports/streams');
    const res = await getStreams(req);
    expect(res.status).toBe(400);

    const reqUnknown = new Request('http://localhost:3000/api/sports/streams?source=unknown&id=123');
    const resUnknown = await getStreams(reqUnknown);
    expect(resUnknown.status).toBe(200);
    const dataUnknown = await resUnknown.json();
    expect(dataUnknown.streams).toEqual([]);
  });
});
