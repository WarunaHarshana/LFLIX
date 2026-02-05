// Mobile fetch wrapper - automatically adds server URL for native app
import { apiUrl } from './mobileConfig';

/**
 * Fetch wrapper that handles native app server URLs
 */
export async function mobileFetch(
  input: string | URL,
  init?: RequestInit
): Promise<Response> {
  // If input is a string and starts with /, use apiUrl to add server base
  let url: string | URL = input;
  if (typeof input === 'string' && input.startsWith('/')) {
    url = apiUrl(input);
  }

  // Merge default options
  const options: RequestInit = {
    ...init,
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  };

  return fetch(url, options);
}
