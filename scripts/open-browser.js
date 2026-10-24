#!/usr/bin/env node
/**
 * scripts/open-browser.js
 *
 * Polls http://localhost:<port>/api/ping (and fallback /) until LFLIX is ready,
 * then opens the application in the user's default browser.
 */

const http = require('http');
const { exec } = require('child_process');

const port = process.argv[2] || '3000';
const url = `http://localhost:${port}`;
let attempts = 0;
const maxAttempts = 150; // 150 * 600ms ~ 90s
let isOpening = false;

function launchBrowserWin32(targetUrl) {
  // Try cmd start first. Only fallback to PowerShell/rundll32 if it errors.
  exec(`cmd.exe /c start ${targetUrl}`, (err) => {
    if (err) {
      exec(`powershell.exe -NoProfile -NonInteractive -Command "Start-Process '${targetUrl}'"`, (psErr) => {
        if (psErr) {
          exec(`rundll32.exe url.dll,FileProtocolHandler ${targetUrl}`);
        }
      });
    }
  });
}

function openBrowser(targetUrl) {
  if (isOpening) return;
  isOpening = true;

  console.log(`[LFLIX] Server is ready on ${targetUrl}. Opening browser...`);

  if (process.platform === 'win32') {
    launchBrowserWin32(targetUrl);
  } else if (process.platform === 'darwin') {
    exec(`open "${targetUrl}"`);
  } else {
    exec(`xdg-open "${targetUrl}"`);
  }

  // Keep process alive long enough for OS to dispatch the launch
  setTimeout(() => {
    process.exit(0);
  }, 3000);
}

function checkEndpoint(path, callback) {
  let called = false;
  const done = (result) => {
    if (!called) {
      called = true;
      callback(result);
    }
  };

  const req = http.get(`${url}${path}`, { timeout: 2500 }, (res) => {
    // If status is 200, 302, 304, 307 etc., server is alive
    done(res.statusCode >= 200 && res.statusCode < 400);
  });

  req.on('error', () => done(false));
  req.on('timeout', () => {
    req.destroy();
    done(false);
  });
}

function poll() {
  if (isOpening) return;
  attempts++;

  checkEndpoint('/api/ping', (ok) => {
    if (ok) {
      openBrowser(url);
    } else {
      checkEndpoint('/', (rootOk) => {
        if (rootOk) {
          openBrowser(url);
        } else {
          if (attempts >= maxAttempts) {
            console.log(`[LFLIX] Server did not become ready within 90s. Please open ${url} manually.`);
            process.exit(1);
          }
          setTimeout(poll, 600);
        }
      });
    }
  });
}

poll();
