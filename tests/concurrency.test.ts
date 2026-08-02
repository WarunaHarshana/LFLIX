import { describe, expect, it } from 'vitest';
import { mapWithConcurrency } from '@/lib/concurrency';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

describe('mapWithConcurrency', () => {
  it('returns results in input order regardless of completion order', async () => {
    const results = await mapWithConcurrency([30, 10, 20], 3, async (ms) => {
      await tick(ms);
      return ms;
    });
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([30, 10, 20]);
  });

  it('never exceeds the concurrency limit', async () => {
    let active = 0;
    let peak = 0;

    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      active++;
      peak = Math.max(peak, active);
      await tick(1);
      active--;
    });

    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBeGreaterThan(1);
  });

  it('processes every item exactly once', async () => {
    const seen: number[] = [];
    await mapWithConcurrency(Array.from({ length: 50 }, (_, i) => i), 6, async (n) => {
      seen.push(n);
    });
    expect(seen.sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('isolates a rejection instead of aborting the batch', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('boom');
      return n;
    });

    expect(results[0]).toEqual({ status: 'fulfilled', value: 1 });
    expect(results[1].status).toBe('rejected');
    expect(results[2]).toEqual({ status: 'fulfilled', value: 3 });
  });

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });

  it('clamps a nonsensical limit to at least 1', async () => {
    for (const limit of [0, -5, Number.NaN]) {
      const results = await mapWithConcurrency([1, 2], limit, async (n) => n);
      expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([1, 2]);
    }
  });

  it('does actually run work in parallel', async () => {
    const started = Date.now();
    await mapWithConcurrency(Array.from({ length: 8 }, () => 25), 4, async (ms) => tick(ms));
    // Serially this would be ~200ms; with 4 in flight it should be roughly half.
    expect(Date.now() - started).toBeLessThan(160);
  });
});
