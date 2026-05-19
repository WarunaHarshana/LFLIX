export type ObservedSourceStatus = 'ok' | 'timeout' | 'error';
export type SourceHealthState = 'unknown' | 'healthy' | 'degraded' | 'down';

type RecentSourceCheck = {
  status: ObservedSourceStatus;
  results: number;
  durationMs: number;
  checkedAt: string;
  error?: string;
  query?: string;
  cached?: boolean;
};

type SourceHealthBucket = {
  name: string;
  totalChecks: number;
  okChecks: number;
  timeoutCount: number;
  errorCount: number;
  emptyOkCount: number;
  consecutiveFailures: number;
  totalDurationMs: number;
  lastStatus?: ObservedSourceStatus;
  lastResults?: number;
  lastDurationMs?: number;
  lastError?: string;
  lastQuery?: string;
  lastCheckAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  recent: RecentSourceCheck[];
};

export type SourceHealthSnapshot = {
  name: string;
  state: SourceHealthState;
  totalChecks: number;
  okChecks: number;
  timeoutCount: number;
  errorCount: number;
  emptyOkCount: number;
  consecutiveFailures: number;
  lastStatus?: ObservedSourceStatus;
  lastResults?: number;
  lastDurationMs?: number;
  avgDurationMs: number | null;
  lastError?: string;
  lastQuery?: string;
  lastCheckAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
  recent: RecentSourceCheck[];
};

export type SourceHealthRecord = {
  name: string;
  status: ObservedSourceStatus;
  results: number;
  durationMs: number;
  error?: string;
  query?: string;
  cached?: boolean;
};

const MAX_RECENT_CHECKS = 20;
const RECENT_FAILURE_WINDOW = 10;
const DOWN_AFTER_CONSECUTIVE_FAILURES = 3;
const DEGRADED_FAILURE_RATE = 0.35;

const buckets = new Map<string, SourceHealthBucket>();

function sanitizeText(value: string | undefined, maxLength = 160): string | undefined {
  if (!value) return undefined;
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 3)}...` : clean;
}

function getOrCreateBucket(name: string): SourceHealthBucket {
  const existing = buckets.get(name);
  if (existing) return existing;

  const created: SourceHealthBucket = {
    name,
    totalChecks: 0,
    okChecks: 0,
    timeoutCount: 0,
    errorCount: 0,
    emptyOkCount: 0,
    consecutiveFailures: 0,
    totalDurationMs: 0,
    recent: [],
  };
  buckets.set(name, created);
  return created;
}

function resolveState(bucket: SourceHealthBucket): SourceHealthState {
  if (bucket.totalChecks === 0 || !bucket.lastStatus) return 'unknown';
  if (bucket.consecutiveFailures >= DOWN_AFTER_CONSECUTIVE_FAILURES) return 'down';
  if (bucket.lastStatus !== 'ok') return 'degraded';

  const recent = bucket.recent.slice(-RECENT_FAILURE_WINDOW);
  if (recent.length >= 5) {
    const failures = recent.filter((check) => check.status !== 'ok').length;
    if (failures / recent.length >= DEGRADED_FAILURE_RATE) return 'degraded';
  }

  return 'healthy';
}

function emptySnapshot(name: string): SourceHealthSnapshot {
  return {
    name,
    state: 'unknown',
    totalChecks: 0,
    okChecks: 0,
    timeoutCount: 0,
    errorCount: 0,
    emptyOkCount: 0,
    consecutiveFailures: 0,
    avgDurationMs: null,
    recent: [],
  };
}

function toSnapshot(bucket: SourceHealthBucket): SourceHealthSnapshot {
  return {
    name: bucket.name,
    state: resolveState(bucket),
    totalChecks: bucket.totalChecks,
    okChecks: bucket.okChecks,
    timeoutCount: bucket.timeoutCount,
    errorCount: bucket.errorCount,
    emptyOkCount: bucket.emptyOkCount,
    consecutiveFailures: bucket.consecutiveFailures,
    lastStatus: bucket.lastStatus,
    lastResults: bucket.lastResults,
    lastDurationMs: bucket.lastDurationMs,
    avgDurationMs: bucket.totalChecks > 0 ? Math.round(bucket.totalDurationMs / bucket.totalChecks) : null,
    lastError: bucket.lastError,
    lastQuery: bucket.lastQuery,
    lastCheckAt: bucket.lastCheckAt,
    lastSuccessAt: bucket.lastSuccessAt,
    lastFailureAt: bucket.lastFailureAt,
    recent: [...bucket.recent],
  };
}

export function recordSourceHealth(input: SourceHealthRecord): void {
  const bucket = getOrCreateBucket(input.name);
  const checkedAt = new Date().toISOString();
  const previousFailures = bucket.consecutiveFailures;
  const error = sanitizeText(input.error, 220);
  const query = sanitizeText(input.query, 120);
  const durationMs = Math.max(0, Math.round(input.durationMs));
  const results = Math.max(0, Math.round(input.results));

  bucket.totalChecks += 1;
  bucket.totalDurationMs += durationMs;
  bucket.lastStatus = input.status;
  bucket.lastResults = results;
  bucket.lastDurationMs = durationMs;
  bucket.lastError = error;
  bucket.lastQuery = query;
  bucket.lastCheckAt = checkedAt;

  if (input.status === 'ok') {
    bucket.okChecks += 1;
    bucket.consecutiveFailures = 0;
    bucket.lastSuccessAt = checkedAt;
    if (results === 0) bucket.emptyOkCount += 1;

    if (previousFailures > 0) {
      console.info(`[SourceHealth] ${input.name} recovered after ${previousFailures} failed check(s)`);
    }
  } else {
    if (input.status === 'timeout') {
      bucket.timeoutCount += 1;
    } else {
      bucket.errorCount += 1;
    }
    bucket.consecutiveFailures += 1;
    bucket.lastFailureAt = checkedAt;
    console.warn(`[SourceHealth] ${input.name} ${input.status}: ${error || 'Source failed'}`);
  }

  bucket.recent.push({
    status: input.status,
    results,
    durationMs,
    checkedAt,
    error,
    query,
    cached: input.cached,
  });

  while (bucket.recent.length > MAX_RECENT_CHECKS) {
    bucket.recent.shift();
  }
}

export function getSourceHealthSnapshot(sourceNames: string[] = []): SourceHealthSnapshot[] {
  const orderedNames = new Set<string>(sourceNames);
  for (const name of buckets.keys()) {
    orderedNames.add(name);
  }

  return [...orderedNames].map((name) => {
    const bucket = buckets.get(name);
    return bucket ? toSnapshot(bucket) : emptySnapshot(name);
  });
}
