import fs from 'fs';
import dns from 'dns/promises';
import net from 'net';
import path from 'path';

type PathValidation = { path: string; error: null } | { path: null; error: string };
type UrlValidation = { url: string; error: null } | { url: null; error: string };

export function parsePositiveInt(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getSafeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected server error';
}

export function toAbsolutePath(input: unknown): PathValidation {
  if (typeof input !== 'string' || input.trim() === '') {
    return { path: null, error: 'Path is required' };
  }
  if (input.includes('\0')) {
    return { path: null, error: 'Invalid path' };
  }

  const resolved = path.resolve(input);
  if (!path.isAbsolute(resolved)) {
    return { path: null, error: 'Path must be absolute' };
  }

  return { path: resolved, error: null };
}

export function validateExistingDirectory(input: unknown): PathValidation {
  const result = toAbsolutePath(input);
  if (result.error !== null) return result;

  if (!fs.existsSync(result.path)) {
    return { path: null, error: 'Path does not exist' };
  }
  if (!fs.statSync(result.path).isDirectory()) {
    return { path: null, error: 'Path is not a directory' };
  }

  return { path: result.path, error: null };
}

export function validateExistingFile(input: unknown): PathValidation {
  const result = toAbsolutePath(input);
  if (result.error !== null) return result;

  if (!fs.existsSync(result.path)) {
    return { path: null, error: 'File does not exist' };
  }
  if (!fs.statSync(result.path).isFile()) {
    return { path: null, error: 'Path is not a file' };
  }

  return { path: result.path, error: null };
}

export function isPathInside(childPath: string, parentPath: string): boolean {
  const child = path.resolve(childPath);
  const parent = path.resolve(parentPath);
  const relative = path.relative(parent, child);

  return relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
}

export function isPathInsideAny(childPath: string, parentPaths: string[]): boolean {
  return parentPaths.some((parentPath) => isPathInside(childPath, parentPath));
}

export function sanitizeFilename(filename: string, fallback = 'download'): string {
  const base = path.basename(filename || fallback);
  const sanitized = base.replace(/[^a-z0-9._-]/gi, '_').replace(/^_+/, '');
  return sanitized || fallback;
}

function isPrivateIPv4(hostname: string): boolean {
  const parts = hostname.split('.').map(part => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIPv6(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  );
}

function isPrivateHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;

  const ipVersion = net.isIP(normalized);
  if (ipVersion === 4) return isPrivateIPv4(normalized);
  if (ipVersion === 6) return isPrivateIPv6(normalized);

  return false;
}

export async function validateHttpDownloadUrl(input: unknown): Promise<UrlValidation> {
  if (typeof input !== 'string' || input.trim() === '') {
    return { url: null, error: 'HTTP URL is required' };
  }

  if (input.length > 4096 || input.includes('\0')) {
    return { url: null, error: 'Invalid HTTP URL' };
  }

  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { url: null, error: 'Invalid HTTP URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { url: null, error: 'HTTP downloads must use http or https URLs' };
  }

  if (url.username || url.password) {
    return { url: null, error: 'HTTP download URLs cannot include credentials' };
  }

  const allowPrivate = process.env.ALLOW_PRIVATE_DOWNLOAD_URLS === '1';
  if (!allowPrivate) {
    if (isPrivateHostname(url.hostname)) {
      return { url: null, error: 'Private or local download URLs are blocked' };
    }

    try {
      const addresses = await dns.lookup(url.hostname, { all: true, verbatim: true });
      if (addresses.some(address => isPrivateHostname(address.address))) {
        return { url: null, error: 'Private or local download URLs are blocked' };
      }
    } catch {
      return { url: null, error: 'Could not resolve download URL hostname' };
    }
  }

  return { url: url.href, error: null };
}
