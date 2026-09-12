/**
 * Direct Download Health & Quota Probe Utility
 *
 * Lightweight checks for direct download stream URLs before initiating
 * multi-connection downloads or when listing search results.
 */

export interface DirectDownloadProbeResult {
  ok: boolean;
  status?: number;
  quotaExceeded: boolean;
  error?: string;
}

/**
 * Perform a lightweight HTTP probe (Range: bytes=0-0) on a direct download URL.
 * Detects whether the link is alive, expired (404/410), or has exceeded Google Drive quota (403).
 */
export async function probeDirectDownloadUrl(
  url: string,
  timeoutMs = 3000
): Promise<DirectDownloadProbeResult> {
  if (!url || typeof url !== 'string') {
    return { ok: false, quotaExceeded: false, error: 'Invalid download URL' };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      },
      signal: controller.signal,
    });

    // 200 OK or 206 Partial Content means the stream is live and downloadable
    if (res.status === 200 || res.status === 206) {
      // Abort body stream immediately to avoid downloading multi-gigabyte media payload
      controller.abort();
      return { ok: true, status: res.status, quotaExceeded: false };
    }

    if (res.status === 403) {
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        /* ignore */
      }

      const isQuotaExceeded =
        /downloadQuotaExceeded/i.test(bodyText) ||
        /download quota.*exceeded/i.test(bodyText) ||
        /usageLimits/i.test(bodyText) ||
        /quota.*exceeded/i.test(bodyText) ||
        /workers\.dev|shegu\.st|cinejoy|4khdhub/i.test(url);

      if (isQuotaExceeded) {
        return {
          ok: false,
          status: 403,
          quotaExceeded: true,
          error:
            'Google Drive download quota exceeded for this file. Please choose another quality link (e.g. 1080p) or download via torrent.',
        };
      }

      return {
        ok: false,
        status: 403,
        quotaExceeded: false,
        error: 'Download access forbidden (HTTP 403). Upstream host refused connection.',
      };
    }

    if (res.status === 404) {
      return {
        ok: false,
        status: 404,
        quotaExceeded: false,
        error: 'File not found on host (HTTP 404). The stream link may have expired.',
      };
    }

    if (res.status === 410) {
      return {
        ok: false,
        status: 410,
        quotaExceeded: false,
        error: 'Download link has expired (HTTP 410). Please search and choose a fresh link.',
      };
    }

    if (res.status >= 500) {
      return {
        ok: false,
        status: res.status,
        quotaExceeded: false,
        error: `Host server temporarily unavailable (HTTP ${res.status}). Please try again later.`,
      };
    }

    // For other statuses (e.g. redirects, 405 Method Not Allowed), allow download to proceed
    return { ok: true, status: res.status, quotaExceeded: false };
  } catch {
    // Network timeout or non-critical error: do not strictly block, let downloader try
    return { ok: true, quotaExceeded: false };
  } finally {
    clearTimeout(timeoutId);
  }
}
