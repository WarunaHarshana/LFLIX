/**
 * Ordering for third-party streaming servers.
 *
 * Kept out of the component so it can be exercised directly — StreamServerModal
 * pulls in the video player and Capacitor, which will not load in a plain test
 * environment.
 */
export type RankableServer = {
  id: string;
  order: number;
  isReachable: boolean;
  qualityHint: '2160p' | '1080p' | '720p' | 'unknown';
  latencyMs: number;
  isDirect?: boolean;
  tier?: 'best' | 'great' | 'good' | 'ok';
};

const QUALITY_RANK: Record<RankableServer['qualityHint'], number> = {
  unknown: 0,
  '720p': 1,
  '1080p': 2,
  '2160p': 3,
};

const TIER_RANK: Record<string, number> = {
  best: 4,
  great: 3,
  good: 2,
  ok: 1,
};

export function rankServersByQuality<T extends RankableServer>(servers: T[]): T[] {
  return [...servers].sort((a, b) => {
    // 1. Reachability.
    //
    // This used to sit below quality, which meant an unreachable 4K server
    // outranked a reachable 1080p one: playback started on a dead host and the
    // viewer waited out the failover timeout before seeing anything. A stream
    // that does not play has no quality.
    const reachableDiff = Number(b.isReachable) - Number(a.isReachable);
    if (reachableDiff !== 0) {
      return reachableDiff;
    }

    // 2. Quality Resolution (highest quality first)
    const rankDiff = QUALITY_RANK[b.qualityHint] - QUALITY_RANK[a.qualityHint];
    if (rankDiff !== 0) {
      return rankDiff;
    }

    // 3. Direct streams. These play through our own player, so ABR, the
    //    quality picker and subtitles all work; an embed is an opaque iframe.
    if (a.isDirect !== b.isDirect) {
      return a.isDirect ? -1 : 1;
    }

    // 4. Source Tier (best > great > good > ok)
    const tierRankA = a.tier ? (TIER_RANK[a.tier] ?? 1) : 1;
    const tierRankB = b.tier ? (TIER_RANK[b.tier] ?? 1) : 1;
    if (tierRankB !== tierRankA) {
      return tierRankB - tierRankA;
    }

    // 5. Latency (lower latency first)
    const latencyA = Number.isFinite(a.latencyMs) ? a.latencyMs : Number.MAX_SAFE_INTEGER;
    const latencyB = Number.isFinite(b.latencyMs) ? b.latencyMs : Number.MAX_SAFE_INTEGER;
    if (latencyA !== latencyB) {
      return latencyA - latencyB;
    }

    return a.order - b.order;
  });
}

