import fs from 'fs';
import path from 'path';

type PathValidation = { path: string; error: null } | { path: null; error: string };

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
