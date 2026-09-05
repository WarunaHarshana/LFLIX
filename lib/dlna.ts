import http from 'http';
import dgram from 'dgram';
import fs from 'fs';
import db from './db';
import { getLocalIpAddress } from './network';

interface GlobalDlnaState {
  isRunning: boolean;
  serverInstance: http.Server | null;
  ssdpInterval: NodeJS.Timeout | null;
  ssdpSearchSocket: dgram.Socket | null;
  currentDlnaIp: string | null;
  handler?: (req: http.IncomingMessage, res: http.ServerResponse) => void;
}

const g = globalThis as unknown as { __dlnaState?: GlobalDlnaState };
if (!g.__dlnaState) {
  g.__dlnaState = {
    isRunning: false,
    serverInstance: null,
    ssdpInterval: null,
    ssdpSearchSocket: null,
    currentDlnaIp: null,
  };
}
const dlnaState = g.__dlnaState;

export const DLNA_PORT = parseInt(process.env.DLNA_PORT || '3001', 10);

export function getDlnaIp(): string {
  if (!dlnaState.currentDlnaIp || dlnaState.currentDlnaIp === '127.0.0.1' || dlnaState.currentDlnaIp === 'localhost') {
    dlnaState.currentDlnaIp = getLocalIpAddress();
  }
  return dlnaState.currentDlnaIp;
}

export function getDlnaStatus(): boolean {
  return dlnaState.isRunning;
}

function getDeviceDescription(): string {
  const ip = getDlnaIp();
  return `<?xml version="1.0" encoding="UTF-8"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <friendlyName>LocalFlix</friendlyName>
    <manufacturer>LocalFlix</manufacturer>
    <modelName>LocalFlix Media Server</modelName>
    <modelNumber>1.0</modelNumber>
    <serialNumber>001</serialNumber>
    <UDN>uuid:localflix-001</UDN>
    <presentationURL>http://${ip}:3000</presentationURL>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>
        <SCPDURL>/cds</SCPDURL>
        <controlURL>/cds/control</controlURL>
        <eventSubURL>/cds/event</eventSubURL>
      </service>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ConnectionManager:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ConnectionManager</serviceId>
        <SCPDURL>/cm</SCPDURL>
        <controlURL>/cm/control</controlURL>
        <eventSubURL>/cm/event</eventSubURL>
      </service>
    </serviceList>
  </device>
</root>`;
}

function getMediaMime(filePath: string): string {
  const ext = filePath ? filePath.split('.').pop()?.toLowerCase() : 'mp4';
  switch (ext) {
    case 'mkv':
      return 'video/x-matroska';
    case 'avi':
      return 'video/x-msvideo';
    case 'mov':
      return 'video/quicktime';
    case 'webm':
      return 'video/webm';
    case 'ts':
      return 'video/mp2t';
    case 'flv':
      return 'video/x-flv';
    case 'wmv':
      return 'video/x-ms-wmv';
    default:
      return 'video/mp4';
  }
}

function escapeDidl(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;amp;')
    .replace(/</g, '&amp;lt;')
    .replace(/>/g, '&amp;gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function handleCdsControl(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const soapAction = (req.headers['soapaction'] || '').toString().replace(/"/g, '');

    if (soapAction.includes('GetSearchCapabilities')) {
      const response = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetSearchCapabilitiesResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <SearchCaps></SearchCaps>
    </u:GetSearchCapabilitiesResponse>
  </s:Body>
</s:Envelope>`;
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(response);
      return;
    }

    if (soapAction.includes('GetSortCapabilities')) {
      const response = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetSortCapabilitiesResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <SortCaps>dc:title</SortCaps>
    </u:GetSortCapabilitiesResponse>
  </s:Body>
</s:Envelope>`;
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(response);
      return;
    }

    if (soapAction.includes('GetSystemUpdateID')) {
      const response = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetSystemUpdateIDResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <Id>1</Id>
    </u:GetSystemUpdateIDResponse>
  </s:Body>
</s:Envelope>`;
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(response);
      return;
    }

    // Default to Browse action
    handleBrowse(body, res);
  });
}

function handleCmControl(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const soapAction = (req.headers['soapaction'] || '').toString().replace(/"/g, '');

    if (soapAction.includes('GetCurrentConnectionIDs')) {
      const response = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetCurrentConnectionIDsResponse xmlns:u="urn:schemas-upnp-org:service:ConnectionManager:1">
      <ConnectionIDs>0</ConnectionIDs>
    </u:GetCurrentConnectionIDsResponse>
  </s:Body>
</s:Envelope>`;
      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(response);
      return;
    }

    // Default to GetProtocolInfo
    const response = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:GetProtocolInfoResponse xmlns:u="urn:schemas-upnp-org:service:ConnectionManager:1">
      <Source>http-get:*:video/mp4:*,http-get:*:video/x-matroska:*,http-get:*:video/mpeg:*,http-get:*:video/webm:*,http-get:*:video/quicktime:*,http-get:*:video/x-msvideo:*</Source>
      <Sink></Sink>
    </u:GetProtocolInfoResponse>
  </s:Body>
</s:Envelope>`;
    res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
    res.end(response);
  });
}

function handleBrowse(body: string, res: http.ServerResponse) {
  try {
    const ip = getDlnaIp();

    const objectIdMatch = body.match(/<ObjectID>([^<]+)<\/ObjectID>/i);
    const objectId = objectIdMatch ? objectIdMatch[1].trim() : '0';

    const browseFlagMatch = body.match(/<BrowseFlag>([^<]+)<\/BrowseFlag>/i);
    const browseFlag = browseFlagMatch ? browseFlagMatch[1].trim() : 'BrowseDirectChildren';

    let didlContent = '';
    let count = 0;

    if (browseFlag === 'BrowseMetadata' && objectId === '0') {
      // Return container metadata for root
      didlContent = `&lt;container id="0" parentID="-1" restricted="1" searchable="1"&gt;` +
        `&lt;dc:title&gt;LocalFlix&lt;/dc:title&gt;` +
        `&lt;upnp:class&gt;object.container.storageFolder&lt;/upnp:class&gt;` +
        `&lt;/container&gt;`;
      count = 1;
    } else {
      // BrowseDirectChildren: return movies and episodes
      const movies = db.prepare(`
        SELECT id, title, fileName, filePath
        FROM movies
        ORDER BY title ASC
      `).all() as { id: number; title: string | null; fileName: string; filePath: string }[];

      const episodes = db.prepare(`
        SELECT e.id, e.title, e.fileName, e.filePath, e.seasonNumber, e.episodeNumber, s.title as showTitle
        FROM episodes e
        LEFT JOIN shows s ON e.showId = s.id
        ORDER BY s.title ASC, e.seasonNumber ASC, e.episodeNumber ASC
      `).all() as { id: number; title: string | null; fileName: string; filePath: string; seasonNumber: number; episodeNumber: number; showTitle: string | null }[];

      let items = '';

      for (const movie of movies) {
        const mime = getMediaMime(movie.filePath);
        const title = movie.title || movie.fileName || `Movie ${movie.id}`;
        items += `&lt;item id="movie-${movie.id}" parentID="0" restricted="1"&gt;` +
          `&lt;dc:title&gt;${escapeDidl(title)}&lt;/dc:title&gt;` +
          `&lt;upnp:class&gt;object.item.videoItem.movie&lt;/upnp:class&gt;` +
          `&lt;res protocolInfo="http-get:*:${mime}:*"&gt;http://${ip}:${DLNA_PORT}/media/movie/${movie.id}&lt;/res&gt;` +
          `&lt;/item&gt;`;
        count++;
      }

      for (const ep of episodes) {
        const mime = getMediaMime(ep.filePath);
        const show = ep.showTitle || 'TV Show';
        const s = ep.seasonNumber != null ? `S${ep.seasonNumber}` : 'S1';
        const e = ep.episodeNumber != null ? `E${ep.episodeNumber}` : 'E1';
        const epName = ep.title ? ` - ${ep.title}` : '';
        const title = `${show} ${s}${e}${epName}`;

        items += `&lt;item id="ep-${ep.id}" parentID="0" restricted="1"&gt;` +
          `&lt;dc:title&gt;${escapeDidl(title)}&lt;/dc:title&gt;` +
          `&lt;upnp:class&gt;object.item.videoItem.videoBroadcast&lt;/upnp:class&gt;` +
          `&lt;res protocolInfo="http-get:*:${mime}:*"&gt;http://${ip}:${DLNA_PORT}/media/episode/${ep.id}&lt;/res&gt;` +
          `&lt;/item&gt;`;
        count++;
      }

      didlContent = items;
    }

    const result = `&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"&gt;${didlContent}&lt;/DIDL-Lite&gt;`;

    const soapResponse = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <Result>${result}</Result>
      <NumberReturned>${count}</NumberReturned>
      <TotalMatches>${count}</TotalMatches>
      <UpdateID>1</UpdateID>
    </u:BrowseResponse>
  </s:Body>
</s:Envelope>`;

    res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
    res.end(soapResponse);
  } catch (e) {
    console.error('DLNA Browse error:', e);
    res.writeHead(500, { 'Content-Type': 'text/xml; charset=utf-8' });
    res.end('<?xml version="1.0"?><s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultcode>s:Client</faultcode><faultstring>UPnPError</faultstring></s:Fault></s:Body></s:Envelope>');
  }
}

function streamMedia(req: http.IncomingMessage, url: string, res: http.ServerResponse) {
  try {
    let filePath: string | null = null;
    const cleanUrl = url.split('?')[0];
    const match = cleanUrl.match(/\/media\/(movie|episode)?\/?(\d+)/i);

    if (match) {
      const type = match[1]?.toLowerCase();
      const id = parseInt(match[2], 10);

      if (type === 'movie') {
        const row = db.prepare('SELECT filePath FROM movies WHERE id = ?').get(id) as { filePath: string } | undefined;
        filePath = row?.filePath || null;
      } else if (type === 'episode') {
        const row = db.prepare('SELECT filePath FROM episodes WHERE id = ?').get(id) as { filePath: string } | undefined;
        filePath = row?.filePath || null;
      } else {
        // Fallback: check movies first, then episodes
        const movie = db.prepare('SELECT filePath FROM movies WHERE id = ?').get(id) as { filePath: string } | undefined;
        if (movie?.filePath) {
          filePath = movie.filePath;
        } else {
          const ep = db.prepare('SELECT filePath FROM episodes WHERE id = ?').get(id) as { filePath: string } | undefined;
          filePath = ep?.filePath || null;
        }
      }
    }

    if (!filePath) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Media not found');
      return;
    }

    const normalizedPath = filePath.replace(/\//g, '\\');
    if (!fs.existsSync(normalizedPath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found on disk');
      return;
    }

    const stat = fs.statSync(normalizedPath);
    const mimeType = getMediaMime(normalizedPath);

    // Support HEAD requests
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Type': mimeType,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
      });
      res.end();
      return;
    }

    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
      const chunkSize = end - start + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': mimeType,
      });

      fs.createReadStream(normalizedPath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
    });

    fs.createReadStream(normalizedPath).pipe(res);
  } catch (e) {
    console.error('DLNA Stream error:', e);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url || '/';
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h1>LocalFlix DLNA Server</h1><p>Server is running.</p>');
  } else if (url === '/description.xml' || url === '/rootDesc.xml') {
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(getDeviceDescription());
  } else if (url === '/cds' || url === '/cds/scpd.xml') {
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <actionList>
    <action><name>Browse</name></action>
    <action><name>Search</name></action>
    <action><name>GetSearchCapabilities</name></action>
    <action><name>GetSortCapabilities</name></action>
    <action><name>GetSystemUpdateID</name></action>
  </actionList>
</scpd>`);
  } else if (url === '/cm' || url === '/cm/scpd.xml') {
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(`<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion><major>1</major><minor>0</minor></specVersion>
  <actionList>
    <action><name>GetProtocolInfo</name></action>
    <action><name>GetCurrentConnectionIDs</name></action>
  </actionList>
</scpd>`);
  } else if (url === '/cds/control') {
    handleCdsControl(req, res);
  } else if (url === '/cm/control') {
    handleCmControl(req, res);
  } else if (url.startsWith('/media/')) {
    streamMedia(req, url, res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
}

function sendSsdpNotify() {
  const ip = getDlnaIp();
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  
  const messages = [
    `NOTIFY * HTTP/1.1\r\n` +
    `HOST: 239.255.255.250:1900\r\n` +
    `CACHE-CONTROL: max-age=1800\r\n` +
    `LOCATION: http://${ip}:${DLNA_PORT}/description.xml\r\n` +
    `NT: urn:schemas-upnp-org:device:MediaServer:1\r\n` +
    `NTS: ssdp:alive\r\n` +
    `SERVER: LocalFlix/1.0 UPnP/1.0 DLNADOC/1.50\r\n` +
    `USN: uuid:localflix-001::urn:schemas-upnp-org:device:MediaServer:1\r\n` +
    `\r\n`,
    
    `NOTIFY * HTTP/1.1\r\n` +
    `HOST: 239.255.255.250:1900\r\n` +
    `CACHE-CONTROL: max-age=1800\r\n` +
    `LOCATION: http://${ip}:${DLNA_PORT}/description.xml\r\n` +
    `NT: uuid:localflix-001\r\n` +
    `NTS: ssdp:alive\r\n` +
    `SERVER: LocalFlix/1.0 UPnP/1.0 DLNADOC/1.50\r\n` +
    `USN: uuid:localflix-001\r\n` +
    `\r\n`,
    
    `NOTIFY * HTTP/1.1\r\n` +
    `HOST: 239.255.255.250:1900\r\n` +
    `CACHE-CONTROL: max-age=1800\r\n` +
    `LOCATION: http://${ip}:${DLNA_PORT}/description.xml\r\n` +
    `NT: upnp:rootdevice\r\n` +
    `NTS: ssdp:alive\r\n` +
    `SERVER: LocalFlix/1.0 UPnP/1.0 DLNADOC/1.50\r\n` +
    `USN: uuid:localflix-001::upnp:rootdevice\r\n` +
    `\r\n`
  ];

  socket.bind(() => {
    try {
      socket.setBroadcast(true);
      socket.setMulticastTTL(4);
      
      messages.forEach((msg, i) => {
        setTimeout(() => {
          try {
            socket.send(msg, 1900, '239.255.255.250', (err: any) => {
              if (err) console.error('SSDP error:', err);
            });
          } catch {}
        }, i * 100);
      });
    } catch {}
    
    setTimeout(() => {
      try { socket.close(); } catch {}
    }, 1000);
  });
}

function startSsdpListener() {
  try {
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    socket.on('error', (err) => {
      console.warn('[dlna] SSDP listener socket error:', err.message);
      try { socket.close(); } catch {}
    });

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString();
      if (!text.startsWith('M-SEARCH')) return;

      const ip = getDlnaIp();
      const stMatch = text.match(/ST:\s*([^\r\n]+)/i);
      const st = stMatch ? stMatch[1].trim() : '';

      const shouldRespond =
        st === 'ssdp:all' ||
        st === 'upnp:rootdevice' ||
        st === 'urn:schemas-upnp-org:device:MediaServer:1' ||
        st === 'urn:schemas-upnp-org:service:ContentDirectory:1';

      if (shouldRespond) {
        const response =
          `HTTP/1.1 200 OK\r\n` +
          `CACHE-CONTROL: max-age=1800\r\n` +
          `DATE: ${new Date().toUTCString()}\r\n` +
          `EXT:\r\n` +
          `LOCATION: http://${ip}:${DLNA_PORT}/description.xml\r\n` +
          `SERVER: LocalFlix/1.0 UPnP/1.0 DLNADOC/1.50\r\n` +
          `ST: urn:schemas-upnp-org:device:MediaServer:1\r\n` +
          `USN: uuid:localflix-001::urn:schemas-upnp-org:device:MediaServer:1\r\n` +
          `\r\n`;

        socket.send(Buffer.from(response), rinfo.port, rinfo.address, () => {});
      }
    });

    socket.bind(1900, () => {
      try {
        socket.addMembership('239.255.255.250');
      } catch {}
    });

    dlnaState.ssdpSearchSocket = socket;
  } catch (e: any) {
    console.warn('[dlna] Could not bind M-SEARCH listener on port 1900:', e.message);
  }
}

// Global functions
export function startDlnaServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    dlnaState.handler = handleRequest;

    if (dlnaState.isRunning && dlnaState.serverInstance) {
      console.log('DLNA server already running');
      resolve();
      return;
    }

    try {
      dlnaState.currentDlnaIp = getLocalIpAddress();

      // If server was already listening, simply attach new handler
      if (dlnaState.serverInstance) {
        dlnaState.isRunning = true;
        resolve();
        return;
      }

      const server = http.createServer((req, res) => {
        if (dlnaState.handler) {
          dlnaState.handler(req, res);
        } else {
          handleRequest(req, res);
        }
      });

      server.listen(DLNA_PORT, () => {
        const ip = getDlnaIp();
        console.log(`DLNA Server started on http://${ip}:${DLNA_PORT}`);
        dlnaState.isRunning = true;
        dlnaState.serverInstance = server;
        
        // Send initial SSDP broadcasts
        sendSsdpNotify();
        startSsdpListener();
        
        // Continue broadcasting every 10 seconds for first minute
        let count = 0;
        const bootBroadcast = setInterval(() => {
          sendSsdpNotify();
          count++;
          if (count >= 5) clearInterval(bootBroadcast);
        }, 10000);
        
        // Then every 30 seconds
        if (dlnaState.ssdpInterval) clearInterval(dlnaState.ssdpInterval);
        dlnaState.ssdpInterval = setInterval(sendSsdpNotify, 30000);
        
        resolve();
      });

      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.warn('[dlna] Port 3001 already in use, reusing running instance');
          dlnaState.isRunning = true;
          resolve();
          return;
        }
        console.error('DLNA server error:', err);
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function stopDlnaServer(): void {
  if (dlnaState.serverInstance) {
    try { dlnaState.serverInstance.close(); } catch {}
    dlnaState.serverInstance = null;
  }
  if (dlnaState.ssdpInterval) {
    clearInterval(dlnaState.ssdpInterval);
    dlnaState.ssdpInterval = null;
  }
  if (dlnaState.ssdpSearchSocket) {
    try { dlnaState.ssdpSearchSocket.close(); } catch {}
    dlnaState.ssdpSearchSocket = null;
  }
  dlnaState.isRunning = false;
  console.log('DLNA Server stopped');
}
