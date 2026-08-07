import { describe, expect, it } from 'vitest';
import { rankServersByQuality } from '@/lib/streamServerRanking';

type Server = Parameters<typeof rankServersByQuality>[0][number];

function server(over: Partial<Server> & { id: string }): Server {
  return {
    name: over.id,
    url: `https://${over.id}.example/x`,
    color: '#fff',
    order: 0,
    isReachable: true,
    availabilityState: 'reachable',
    probeError: null,
    probeCheckedAt: '',
    qualityHint: '1080p',
    confidence: 1,
    probeState: 'fast',
    lastCheckedAt: null,
    latencyMs: 100,
    ...over,
  } as Server;
}

const order = (list: Server[]) => rankServersByQuality(list).map((s) => s.id);

describe('rankServersByQuality', () => {
  it('puts a reachable server ahead of an unreachable higher-quality one', () => {
    // The bug this exists for: playback used to start on a dead 4K host and
    // burn the failover timeout before showing anything.
    const list = [
      server({ id: 'dead-4k', qualityHint: '2160p', isReachable: false }),
      server({ id: 'live-1080', qualityHint: '1080p', isReachable: true }),
    ];
    expect(order(list)[0]).toBe('live-1080');
  });

  it('prefers higher quality among reachable servers', () => {
    const list = [
      server({ id: 'hd', qualityHint: '720p' }),
      server({ id: 'uhd', qualityHint: '2160p' }),
      server({ id: 'fhd', qualityHint: '1080p' }),
    ];
    expect(order(list)).toEqual(['uhd', 'fhd', 'hd']);
  });

  it('prefers a direct stream over an embed at the same quality', () => {
    const list = [
      server({ id: 'embed', isDirect: false }),
      server({ id: 'direct', isDirect: true }),
    ];
    expect(order(list)[0]).toBe('direct');
  });

  it('does not promote an unreachable direct stream', () => {
    const list = [
      server({ id: 'direct-dead', isDirect: true, isReachable: false }),
      server({ id: 'embed-live', isDirect: false, isReachable: true }),
    ];
    expect(order(list)[0]).toBe('embed-live');
  });

  it('breaks ties on tier, then latency', () => {
    const byTier = [
      server({ id: 'ok', tier: 'ok' }),
      server({ id: 'best', tier: 'best' }),
    ];
    expect(order(byTier)[0]).toBe('best');

    const byLatency = [
      server({ id: 'slow', tier: 'good', latencyMs: 2000 }),
      server({ id: 'fast', tier: 'good', latencyMs: 120 }),
    ];
    expect(order(byLatency)[0]).toBe('fast');
  });

  it('sorts unknown quality below anything measured', () => {
    const list = [
      server({ id: 'unknown', qualityHint: 'unknown' }),
      server({ id: 'known', qualityHint: '720p' }),
    ];
    expect(order(list)[0]).toBe('known');
  });

  it('does not mutate the input array', () => {
    const list = [server({ id: 'a', qualityHint: '720p' }), server({ id: 'b', qualityHint: '2160p' })];
    const before = list.map((s) => s.id);
    rankServersByQuality(list);
    expect(list.map((s) => s.id)).toEqual(before);
  });
});

describe('unverifiable availability', () => {
  // vidking renders its player client-side and returns the same shell whether
  // or not it holds the title, so "reachable" is an assumption rather than
  // evidence. It must not be auto-selected ahead of a host we confirmed.
  it('ranks a confirmed server above an unverifiable one at equal quality', () => {
    const list = [
      server({ id: 'vidking', unverifiableAvailability: true, qualityHint: '1080p' }),
      server({ id: 'confirmed', qualityHint: '1080p' }),
    ];
    expect(order(list)[0]).toBe('confirmed');
  });

  it('still ranks an unverifiable server above anything unreachable', () => {
    const list = [
      server({ id: 'dead', isReachable: false, qualityHint: '2160p' }),
      server({ id: 'vidking', unverifiableAvailability: true, qualityHint: '720p' }),
    ];
    expect(order(list)[0]).toBe('vidking');
  });

  it('does not let a higher baseline quality override the confirmation gap', () => {
    // A confirmed 720p is still a better bet than an assumed 4K.
    const list = [
      server({ id: 'assumed-4k', unverifiableAvailability: true, qualityHint: '2160p' }),
      server({ id: 'confirmed-720', qualityHint: '720p' }),
    ];
    expect(order(list)[0]).toBe('confirmed-720');
  });
});
