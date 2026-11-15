import { describe, it, expect } from 'vitest';
import { GET as getIptvChannels } from '@/app/api/iptv/channels/route';

describe('/api/iptv/channels route with multi-provider aggregation', () => {
  it('aggregates channels from database, TimStreams, and PPV 24/7 channels', async () => {
    const req = new Request('http://localhost:3000/api/iptv/channels');
    const res = await getIptvChannels(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.channels)).toBe(true);
    expect(data.channels.length).toBeGreaterThan(50);

    // TimStreams channels check
    const timChannels = data.channels.filter((c: any) => c.url && c.url.includes('ehgembxe.cfd'));
    expect(timChannels.length).toBeGreaterThan(100);

    // Categories and country metadata check
    expect(data.channels.some((c: any) => c.country === 'USA')).toBe(true);
    expect(data.channels.some((c: any) => c.category)).toBe(true);
  }, 30000);
});
