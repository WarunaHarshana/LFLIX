import { describe, expect, it } from 'vitest';
import { POST, GET, DELETE, PATCH } from '@/app/api/torrent-stream/route';

describe('/api/torrent-stream route', () => {
  it('rejects POST requests with missing or invalid magnetUri', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ magnetUri: 'invalid-uri' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid or missing magnet URI');
  });

  it('rejects POST requests with empty body', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns empty stream list on GET when no active streams exist', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(Array.isArray(data.streams)).toBe(true);
  });

  it('returns 404 on GET for non-existent infoHash', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream?infoHash=nonexistenthash12345', {
      method: 'GET',
    });

    const res = await GET(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe('Stream not found');
  });

  it('rejects DELETE without infoHash with 400', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream', {
      method: 'DELETE',
    });

    const res = await DELETE(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Missing infoHash');
  });

  it('rejects PATCH with invalid playhead parameters', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ infoHash: 'abc', fileIndex: 'invalid' }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('handles action: heartbeat in POST request', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'heartbeat', infoHash: 'nonexistent123' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
  });

  it('handles action: stop in POST request for sendBeacon compatibility', async () => {
    const req = new Request('http://localhost:3000/api/torrent-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'stop', infoHash: 'nonexistent123' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
  });
});
