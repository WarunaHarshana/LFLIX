import { describe, expect, it } from 'vitest';
import { hasBlockedMarker, looksLikeEmbeddablePage } from '@/app/api/stream-servers/route';

// Trimmed from what these providers actually return: a real player page that
// happens to pull Font Awesome from Cloudflare's CDN.
const REAL_PLAYER_PAGE = `
<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<script src="/cdn-cgi/challenge-platform/h/b/scripts/jsd/main.js"></script>
</head><body><div id="player"></div><script>const hls=new Hls();</script></body></html>
`.toLowerCase();

const CLOUDFLARE_CHALLENGE = `
<!doctype html><html><head><title>Just a moment...</title></head>
<body><div id="cf-browser-verification">checking your browser before accessing</div></body></html>
`.toLowerCase();

describe('hasBlockedMarker', () => {
  it('does not flag a working player that loads assets from Cloudflare', () => {
    // The bug: 'cloudflare' and 'waf' were matched as bare substrings, so a
    // Font Awesome <link> marked every healthy server as blocked — all six
    // servers reported unreachable.
    expect(hasBlockedMarker(REAL_PLAYER_PAGE)).toBe(false);
  });

  it('still flags a genuine Cloudflare interstitial', () => {
    expect(hasBlockedMarker(CLOUDFLARE_CHALLENGE)).toBe(true);
  });

  it.each([
    '<html><body>attention required | cloudflare</body></html>',
    '<html><body>verify you are human</body></html>',
    '<html><body>please enable javascript and cookies to continue</body></html>',
    '<html><body>access denied</body></html>',
  ])('flags interstitial text: %s', (html) => {
    expect(hasBlockedMarker(html.toLowerCase())).toBe(true);
  });

  it('does not flag media titles that merely contain scary words', () => {
    // 'forbidden' used to be a marker — fatal in a media app.
    for (const title of ['Forbidden Planet', 'The Forbidden Kingdom', 'Access Denied (1997) trailer']) {
      const html = `<!doctype html><html><body><div id="player">${title}</div></body></html>`.toLowerCase();
      // Only the one that literally contains the interstitial phrase should match.
      const expected = title.toLowerCase().includes('access denied');
      expect(hasBlockedMarker(html), title).toBe(expected);
    }
  });
});

describe('looksLikeEmbeddablePage', () => {
  it('accepts a real player page', () => {
    expect(looksLikeEmbeddablePage('text/html', REAL_PLAYER_PAGE)).toBe(true);
  });

  it('rejects a challenge page', () => {
    expect(looksLikeEmbeddablePage('text/html', CLOUDFLARE_CHALLENGE)).toBe(false);
  });

  it('rejects non-HTML responses and empty bodies', () => {
    expect(looksLikeEmbeddablePage('application/json', '{"error":"nope"}')).toBe(false);
    expect(looksLikeEmbeddablePage('text/html', '')).toBe(false);
  });

  it('rejects a tiny stub with no player content', () => {
    expect(looksLikeEmbeddablePage('text/html', '<html><body>ok</body></html>')).toBe(false);
  });
});
