// Config utility for LFLIX Mobile App
// Handles server URL detection from URL params or localStorage

import { Capacitor } from '@capacitor/core';

let cachedServerUrl: string | null = null;

/**
 * Check if running in Capacitor native app
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Get the server URL for API calls
 * - In web mode: returns '' (use relative URLs)
 * - In native mode: returns stored server URL or empty string
 */
export function getServerUrl(): string {
  // If not native, use relative URLs
  if (!isNativeApp()) {
    return '';
  }

  // Return cached value
  if (cachedServerUrl !== null) {
    return cachedServerUrl;
  }

  // Check URL params first (from launcher)
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    const serverParam = params.get('server');
    if (serverParam) {
      cachedServerUrl = serverParam;
      // Also save to localStorage for persistence
      localStorage.setItem('lflix_server_url', serverParam);
      return serverParam;
    }

    // Fallback to localStorage
    const stored = localStorage.getItem('lflix_server_url');
    if (stored) {
      cachedServerUrl = stored;
      return stored;
    }
  }

  cachedServerUrl = '';
  return '';
}

/**
 * Build full API URL
 */
export function apiUrl(path: string): string {
  const base = getServerUrl();
  // Ensure path starts with /
  const normalizedPath = path.startsWith('/') ? path : '/' + path;
  return base + normalizedPath;
}

/**
 * Clear stored server URL (for logout/reset)
 */
export function clearServerUrl(): void {
  cachedServerUrl = null;
  if (typeof window !== 'undefined') {
    localStorage.removeItem('lflix_server_url');
  }
}
