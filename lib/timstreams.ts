import crypto from 'crypto';

const DECRYPTION_KEY = "8paW@#1UgOw4=A8iT*5we";

/**
 * Decrypts a base64 encoded AES-GCM encrypted string using the specified key.
 */
export async function decryptTimStreamUrl(encryptedBase64: string, keyStr: string = DECRYPTION_KEY): Promise<string> {
  const keyBuffer = Buffer.from(keyStr, 'utf8').subarray(0, 16);
  const encryptedBuffer = Buffer.from(encryptedBase64, 'base64');
  const iv = encryptedBuffer.subarray(0, 12);
  const ciphertext = encryptedBuffer.subarray(12);

  // Use webcrypto subtle API which is available on globalThis in Node 18+ / Next.js
  const subtle = globalThis.crypto?.subtle || (crypto as unknown as { webcrypto?: { subtle: SubtleCrypto } }).webcrypto?.subtle;
  if (!subtle) {
    throw new Error('WebCrypto subtle is not available');
  }

  const key = await subtle.importKey(
    'raw',
    keyBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  const decryptedBuffer = await subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    ciphertext
  );

  return new TextDecoder().decode(decryptedBuffer);
}

/**
 * Resolves a junkieembeds URL to a direct .m3u8 stream URL.
 */
export async function resolveTimStream(embedUrl: string): Promise<string> {
  // Extract id from URL, e.g. https://junkieembeds.pages.dev/embed/abc-usa -> abc-usa
  const match = embedUrl.match(/\/embed\/([^\/?#]+)/);
  const streamId = match ? match[1] : embedUrl.split('/').pop();
  if (!streamId) {
    throw new Error('Could not extract stream ID from URL: ' + embedUrl);
  }

  const response = await fetch('https://nl-081-v1.vivocdn.xyz/fetch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': 'https://junkieembeds.pages.dev',
      'Referer': 'https://junkieembeds.pages.dev/'
    },
    body: JSON.stringify({ id: streamId })
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch encrypted stream from CDN: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  if (!data.success || !data.url) {
    throw new Error(`CDN API returned failure: ${JSON.stringify(data)}`);
  }

  return await decryptTimStreamUrl(data.url);
}
