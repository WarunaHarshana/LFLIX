'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FolderOpen,
  HardDrive,
  RefreshCw,
  Search,
  Server,
  XCircle,
} from 'lucide-react';

type SourceState = 'unknown' | 'healthy' | 'degraded' | 'down';
type SourceStatus = 'ok' | 'timeout' | 'error';

type SourceHealth = {
  name: string;
  state: SourceState;
  totalChecks: number;
  okChecks: number;
  timeoutCount: number;
  errorCount: number;
  emptyOkCount: number;
  consecutiveFailures: number;
  lastStatus?: SourceStatus;
  lastResults?: number;
  lastDurationMs?: number;
  avgDurationMs: number | null;
  lastError?: string;
  lastQuery?: string;
  lastCheckAt?: string;
  lastSuccessAt?: string;
  lastFailureAt?: string;
};

type HealthPayload = {
  status: 'ok' | 'degraded' | 'down';
  checkedAt: string;
  uptimeSeconds?: number;
  database: {
    ok: boolean;
    journalMode?: string;
    counts?: {
      movies: number;
      shows: number;
      episodes: number;
      watchlist: number;
      autoTrack: number;
      notificationsUnread: number;
    };
  };
  downloads?: {
    active: number;
    byStatus: Record<string, number>;
  };
  releaseTracking?: {
    pendingEpisodes: number;
    attemptedEpisodes: number;
    pendingMovies: number;
    availableMovies: number;
  };
  torrentSources?: SourceHealth[];
  error?: string;
};

type StorageStatus = 'ok' | 'low' | 'critical' | 'unknown';

type StorageLocation = {
  kind: 'app' | 'download' | 'library' | 'download-history';
  label: string;
  path: string;
  contentType?: string | null;
};

type StorageDrive = {
  name: string;
  path: string;
  status: StorageStatus;
  totalBytes: number;
  freeBytes: number;
  usedBytes: number;
  usedPercent: number;
  freePercent: number;
  locations: StorageLocation[];
  error?: string;
};

type StoragePayload = {
  status: StorageStatus;
  checkedAt: string;
  platform: string;
  summary: {
    driveCount: number;
    totalBytes: number;
    freeBytes: number;
    usedBytes: number;
    freePercent: number;
    lowDrives: number;
    criticalDrives: number;
  };
  drives: StorageDrive[];
  error?: string;
};

const stateStyles: Record<SourceState | HealthPayload['status'], string> = {
  ok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  healthy: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  degraded: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  down: 'bg-red-500/15 text-red-300 border-red-500/30',
  unknown: 'bg-neutral-800 text-neutral-400 border-neutral-700',
};

const storageStatusStyles: Record<StorageStatus, string> = {
  ok: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  low: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  critical: 'bg-red-500/15 text-red-300 border-red-500/30',
  unknown: 'bg-neutral-800 text-neutral-400 border-neutral-700',
};

function formatDuration(ms?: number | null): string {
  if (ms === undefined || ms === null) return '-';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatUptime(seconds?: number): string {
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatTimestamp(value?: string): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatPercent(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '-';
  return `${value.toFixed(value < 10 ? 1 : 0)}%`;
}

function StatusIcon({ status }: { status: SourceState | HealthPayload['status'] }) {
  if (status === 'healthy' || status === 'ok') return <CheckCircle2 className="h-4 w-4" />;
  if (status === 'down') return <XCircle className="h-4 w-4" />;
  if (status === 'degraded') return <AlertTriangle className="h-4 w-4" />;
  return <Clock3 className="h-4 w-4" />;
}

function StatusBadge({ status }: { status: SourceState | HealthPayload['status'] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${stateStyles[status]}`}>
      <StatusIcon status={status} />
      {status}
    </span>
  );
}

function StorageStatusBadge({ status }: { status: StorageStatus }) {
  const label = status === 'ok' ? 'healthy' : status;
  const icon = status === 'ok'
    ? <CheckCircle2 className="h-4 w-4" />
    : status === 'critical'
      ? <XCircle className="h-4 w-4" />
      : status === 'low'
        ? <AlertTriangle className="h-4 w-4" />
        : <Clock3 className="h-4 w-4" />;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${storageStatusStyles[status]}`}>
      {icon}
      {label}
    </span>
  );
}

function MetricTile({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail?: string;
}) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3">
      <div className="mb-3 flex items-center gap-2 text-neutral-400">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {detail && <div className="mt-1 text-xs text-neutral-500">{detail}</div>}
    </div>
  );
}

function StorageDriveRow({ drive }: { drive: StorageDrive }) {
  const usedPercent = Math.min(100, Math.max(0, drive.usedPercent || 0));

  return (
    <div className="border-b border-neutral-900 px-4 py-4 last:border-b-0">
      <div className="grid gap-4 lg:grid-cols-[minmax(170px,1fr)_minmax(260px,1.5fr)_minmax(200px,1fr)] lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-neutral-400" />
            <span className="font-semibold text-white">{drive.name}</span>
            <StorageStatusBadge status={drive.status} />
          </div>
          <div className="mt-1 truncate font-mono text-xs text-neutral-500" title={drive.path}>
            {drive.path}
          </div>
          {drive.error && (
            <div className="mt-1 truncate text-xs text-red-300" title={drive.error}>
              {drive.error}
            </div>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between text-xs text-neutral-500">
            <span>{formatBytes(drive.usedBytes)} used</span>
            <span>{formatBytes(drive.freeBytes)} free</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
            <div
              className={`h-full rounded-full ${
                drive.status === 'critical'
                  ? 'bg-red-400'
                  : drive.status === 'low'
                    ? 'bg-amber-400'
                    : 'bg-emerald-400'
              }`}
              style={{ width: `${usedPercent}%` }}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-3 text-xs">
            <div>
              <div className="text-neutral-500">Used</div>
              <div className="mt-0.5 text-neutral-200">{formatPercent(drive.usedPercent)}</div>
            </div>
            <div>
              <div className="text-neutral-500">Free</div>
              <div className="mt-0.5 text-neutral-200">{formatPercent(drive.freePercent)}</div>
            </div>
            <div>
              <div className="text-neutral-500">Total</div>
              <div className="mt-0.5 text-neutral-200">{formatBytes(drive.totalBytes)}</div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">
            <FolderOpen className="h-3.5 w-3.5" />
            LFLIX paths
          </div>
          {drive.locations.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {drive.locations.map((location) => (
                <span
                  key={`${location.kind}-${location.path}`}
                  className="max-w-full rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1 text-xs text-neutral-300"
                  title={location.path}
                >
                  <span className="text-neutral-500">{location.kind.replace('-', ' ')}:</span> {location.label}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-xs text-neutral-500">No configured LFLIX folders on this drive</div>
          )}
        </div>
      </div>
    </div>
  );
}

function SourceHealthRow({ source }: { source: SourceHealth }) {
  const successRate = source.totalChecks > 0
    ? Math.round((source.okChecks / source.totalChecks) * 100)
    : null;

  return (
    <div className="grid gap-4 border-b border-neutral-900 px-4 py-4 last:border-b-0 md:grid-cols-[minmax(120px,1fr)_120px_120px_120px_140px_minmax(160px,1.4fr)] md:items-center">
      <div>
        <div className="flex items-center gap-2">
          <span className="font-semibold text-white">{source.name}</span>
          <StatusBadge status={source.state} />
        </div>
        <div className="mt-1 truncate text-xs text-neutral-500">
          {source.lastQuery || 'No live checks yet'}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500">Last</div>
        <div className="mt-1 text-sm text-neutral-200">{source.lastStatus || '-'}</div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500">Results</div>
        <div className="mt-1 text-sm text-neutral-200">{source.lastResults ?? '-'}</div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500">Latency</div>
        <div className="mt-1 text-sm text-neutral-200">{formatDuration(source.lastDurationMs)}</div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500">Reliability</div>
        <div className="mt-1 text-sm text-neutral-200">
          {successRate === null ? '-' : `${successRate}% ok`}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-wide text-neutral-500">Last Check</div>
        <div className="mt-1 text-sm text-neutral-200">{formatTimestamp(source.lastCheckAt)}</div>
        {source.lastError && (
          <div className="mt-1 truncate text-xs text-red-300" title={source.lastError}>
            {source.lastError}
          </div>
        )}
      </div>
    </div>
  );
}

export default function DiagnosticsPage() {
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [storage, setStorage] = useState<StoragePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);

  const fetchHealth = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    setError(null);
    setStorageError(null);

    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const payload = await response.json() as HealthPayload;
      setHealth(payload);
      if (!response.ok) {
        setError(payload.error || 'Health check failed');
      }

      try {
        const storageResponse = await fetch('/api/storage', { cache: 'no-store' });
        const storagePayload = await storageResponse.json() as StoragePayload;
        setStorage(storagePayload);
        if (!storageResponse.ok) {
          setStorageError(storagePayload.error || 'Storage check failed');
        }
      } catch (storageErr) {
        setStorageError(storageErr instanceof Error ? storageErr.message : 'Storage check failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Health check failed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchHealth();
    const timer = window.setInterval(() => {
      void fetchHealth();
    }, 30000);

    return () => window.clearInterval(timer);
  }, [fetchHealth]);

  const downloadStatuses = useMemo(() => {
    return Object.entries(health?.downloads?.byStatus || {})
      .sort(([a], [b]) => a.localeCompare(b));
  }, [health]);

  const sortedDrives = useMemo(() => {
    return [...(storage?.drives || [])].sort((a, b) => {
      const priority: Record<StorageStatus, number> = { critical: 0, low: 1, unknown: 2, ok: 3 };
      const priorityDiff = priority[a.status] - priority[b.status];
      if (priorityDiff !== 0) return priorityDiff;
      return a.name.localeCompare(b.name);
    });
  }, [storage?.drives]);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-black text-white">
        <RefreshCw className="h-8 w-8 animate-spin text-neutral-500" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-white">
      <header className="border-b border-neutral-800 bg-neutral-950">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-5 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <Link href="/settings" className="rounded-full p-2 transition hover:bg-neutral-800" title="Back to settings">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <div className="flex items-center gap-3">
                <Activity className="h-6 w-6 text-[var(--text-secondary)]" />
                <h1 className="text-2xl font-bold">Diagnostics</h1>
              </div>
              <div className="mt-1 text-sm text-neutral-500">
                Last checked {formatTimestamp(health?.checkedAt)}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {health && <StatusBadge status={health.status} />}
            <button
              onClick={() => void fetchHealth(true)}
              disabled={refreshing}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:bg-neutral-700 disabled:text-neutral-300"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8">
        {error && (
          <div className="mb-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricTile
            icon={<Database className="h-4 w-4" />}
            label="Database"
            value={health?.database.ok ? 'Online' : 'Offline'}
            detail={health?.database.journalMode ? `SQLite ${health.database.journalMode}` : undefined}
          />
          <MetricTile
            icon={<Download className="h-4 w-4" />}
            label="Downloads"
            value={health?.downloads?.active ?? 0}
            detail={`${downloadStatuses.length} status bucket${downloadStatuses.length === 1 ? '' : 's'}`}
          />
          <MetricTile
            icon={<Search className="h-4 w-4" />}
            label="Release Queue"
            value={(health?.releaseTracking?.pendingEpisodes || 0) + (health?.releaseTracking?.pendingMovies || 0)}
            detail={`${health?.releaseTracking?.attemptedEpisodes ?? 0} attempted episodes`}
          />
          <MetricTile
            icon={<Server className="h-4 w-4" />}
            label="Uptime"
            value={formatUptime(health?.uptimeSeconds)}
            detail={health?.checkedAt ? new Date(health.checkedAt).toDateString() : undefined}
          />
          <MetricTile
            icon={<HardDrive className="h-4 w-4" />}
            label="Storage"
            value={storage?.status === 'ok' ? 'Healthy' : storage?.status || '-'}
            detail={storage ? `${formatBytes(storage.summary.freeBytes)} free across ${storage.summary.driveCount} drive${storage.summary.driveCount === 1 ? '' : 's'}` : undefined}
          />
        </section>

        <section className="mt-8 rounded-lg border border-neutral-800 bg-neutral-950">
          <div className="flex flex-col gap-3 border-b border-neutral-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Storage Sense</h2>
              <div className="mt-1 text-sm text-neutral-500">
                Local drive capacity, free-space warnings, and LFLIX folder placement
              </div>
            </div>
            <div className="flex items-center gap-3">
              {storage && <StorageStatusBadge status={storage.status} />}
              <span className="text-sm text-neutral-500">
                {storage ? `${formatBytes(storage.summary.freeBytes)} free` : 'No storage data'}
              </span>
            </div>
          </div>
          {storageError && (
            <div className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {storageError}
            </div>
          )}
          <div>
            {sortedDrives.length > 0 ? sortedDrives.map((drive) => (
              <StorageDriveRow key={drive.path} drive={drive} />
            )) : (
              <div className="px-4 py-6 text-sm text-neutral-500">No local drives detected.</div>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-lg border border-neutral-800 bg-neutral-950">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-4">
            <h2 className="text-lg font-semibold">Torrent Sources</h2>
            <span className="text-sm text-neutral-500">{health?.torrentSources?.length || 0} tracked</span>
          </div>
          <div>
            {(health?.torrentSources || []).map((source) => (
              <SourceHealthRow key={source.name} source={source} />
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-400">Library Counts</h2>
            <div className="space-y-3 text-sm">
              {Object.entries(health?.database.counts || {}).map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="capitalize text-neutral-400">{label.replace(/([A-Z])/g, ' $1')}</span>
                  <span className="font-semibold text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-400">Download Status</h2>
            <div className="space-y-3 text-sm">
              {downloadStatuses.length > 0 ? downloadStatuses.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4">
                  <span className="capitalize text-neutral-400">{label}</span>
                  <span className="font-semibold text-white">{value}</span>
                </div>
              )) : (
                <div className="text-neutral-500">No downloads recorded</div>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-neutral-400">Release Tracking</h2>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-neutral-400">Pending episodes</span>
                <span className="font-semibold text-white">{health?.releaseTracking?.pendingEpisodes ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-neutral-400">Attempted episodes</span>
                <span className="font-semibold text-white">{health?.releaseTracking?.attemptedEpisodes ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-neutral-400">Pending movies</span>
                <span className="font-semibold text-white">{health?.releaseTracking?.pendingMovies ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-neutral-400">Available movies</span>
                <span className="font-semibold text-white">{health?.releaseTracking?.availableMovies ?? 0}</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
