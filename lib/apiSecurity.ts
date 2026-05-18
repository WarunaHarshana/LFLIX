import { NextResponse } from 'next/server';

export class ApiRequestError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type RateLimitOptions = {
  windowMs: number;
  max: number;
};

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

function getClientKey(req: Request, scope: string): string {
  const forwardedFor = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = req.headers.get('x-real-ip')?.trim();
  const userAgent = req.headers.get('user-agent')?.slice(0, 80) || 'unknown';
  return `${scope}:${forwardedFor || realIp || 'local'}:${userAgent}`;
}

export function rateLimit(req: Request, scope: string, options: RateLimitOptions): NextResponse | null {
  const now = Date.now();
  if (rateLimitBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateLimitBuckets) {
      if (bucket.resetAt <= now) rateLimitBuckets.delete(bucketKey);
    }
  }

  const key = getClientKey(req, scope);
  const existing = rateLimitBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return null;
  }

  existing.count += 1;
  if (existing.count <= options.max) return null;

  const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
  return NextResponse.json(
    { error: 'Too many requests. Please slow down and try again.' },
    {
      status: 429,
      headers: {
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(options.max),
        'X-RateLimit-Reset': String(Math.ceil(existing.resetAt / 1000)),
      },
    }
  );
}

export async function readJsonObject(req: Request, maxBytes = 1024 * 1024): Promise<Record<string, unknown>> {
  const contentLength = Number.parseInt(req.headers.get('content-length') || '0', 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new ApiRequestError(413, 'Request body is too large');
  }

  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new ApiRequestError(400, 'Invalid JSON body');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ApiRequestError(400, 'JSON body must be an object');
  }

  return parsed as Record<string, unknown>;
}

export function apiErrorResponse(error: unknown, fallback = 'Unexpected server error'): NextResponse {
  if (error instanceof ApiRequestError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const message = error instanceof Error ? error.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}
