import http from 'http';
import dgram from 'dgram';
import fs from 'fs';
import db from './db';
import { getLocalIpAddress } from './network';

// Global state to track if server is running
let isRunning = false;
let serverInstance: http.Server | null = null;
let ssdpInterval: NodeJS.Timeout | null = null;
let ssdpSearchSocket: dgram.Socket | null = null;

export const DLNA_PORT = 3001;

let currentDlnaIp: string | null = null;

export function getDlnaIp(): string {
  if (!currentDlnaIp || currentDlnaIp === '127.0.0.1' || currentDlnaIp === 'localhost') {
    currentDlnaIp = getLocalIpAddress();
  }
  return currentDlnaIp;
}

export function getDlnaStatus(): boolean {
  return isRunning;
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

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
  const url = req.url || '/';
  
  res.setHeader('Access-Control-Allow-Origin', '*');

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
</scpd>`);
  } else if (url === '/cds/control') {
    handleBrowse(req, res);
  } else if (url.startsWith('/media/')) {
    streamMedia(req, url, res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
}

function handleBrowse(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const ip = getDlnaIp();
      const movies = db.prepare('SELECT id, title, filePath, mimeType FROM movies ORDER BY title ASC').all() as any[];
      
      let result = '&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"&gt;';
      
      for (const movie of movies) {
        const ext = movie.filePath ? movie.filePath.split('.').pop()?.toLowerCase() : 'mp4';
        const mime = movie.mimeType || (ext === 'mkv' ? 'video/x-matroska' : ext === 'mp4' ? 'video/mp4' : 'video/mpeg');
        
        result += `&lt;item id="${movie.id}" parentID="0" restricted="1"&gt;`;
        result += `&lt;dc:title&gt;${escapeXml(movie.title)}&lt;/dc:title&gt;`;
        result += `&lt;upnp:class&gt;object.item.videoItem&lt;/upnp:class&gt;`;
        result += `&lt;res protocolInfo="http-get:*:${mime}:*"&gt;http://${ip}:${DLNA_PORT}/media/${movie.id}&lt;/res&gt;`;
        result += `&lt;/item&gt;`;
      }
      result += '&lt;/DIDL-Lite&gt;';

      const soapResponse = `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <Result>${result}</Result>
      <NumberReturned>${movies.length}</NumberReturned>
      <TotalMatches>${movies.length}</TotalMatches>
      <UpdateID>1</UpdateID>
    </u:BrowseResponse>
  </s:Body>
</s:Envelope>`;

      res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });
      res.end(soapResponse);
    } catch (e) {
      console.error('DLNA Browse error:', e);
      res.writeHead(500);
      res.end('Error');
    }
  });
}

function streamMedia(req: http.IncomingMessage, url: string, res: http.ServerResponse) {
  const id = parseInt(url.split('/').pop() || '0', 10);
  if (!id) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  try {
    const movie = db.prepare('SELECT filePath FROM movies WHERE id = ?').get(id) as { filePath: string } | undefined;
    if (!movie) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const filePath = movie.filePath.replace(/\//g, '\\');
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    const stat = fs.statSync(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase() || 'mp4';
    const mimeType = ext === 'mp4' ? 'video/mp4' : ext === 'mkv' ? 'video/x-matroska' : 'video/mpeg';

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

      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
    });

    fs.createReadStream(filePath).pipe(res);
  } catch (e) {
    console.error('DLNA Stream error:', e);
    res.writeHead(500);
    res.end('Error');
  }
}

function escapeXml(str: string): string {
  return str.replace(/[<>&'"]/g, c => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;'
  }[c] || c));
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

    ssdpSearchSocket = socket;
  } catch (e: any) {
    console.warn('[dlna] Could not bind M-SEARCH listener on port 1900:', e.message);
  }
}

// Global functions
export function startDlnaServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isRunning && serverInstance) {
      console.log('DLNA server already running');
      resolve();
      return;
    }

    try {
      currentDlnaIp = getLocalIpAddress();
      serverInstance = http.createServer(handleRequest);
      
      serverInstance.listen(DLNA_PORT, () => {
        const ip = getDlnaIp();
        console.log(`DLNA Server started on http://${ip}:${DLNA_PORT}`);
        isRunning = true;
        
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
        ssdpInterval = setInterval(sendSsdpNotify, 30000);
        
        resolve();
      });

      serverInstance.on('error', (err) => {
        console.error('DLNA server error:', err);
        reject(err);
      });
    } catch (e) {
      reject(e);
    }
  });
}

export function stopDlnaServer(): void {
  if (serverInstance) {
    try { serverInstance.close(); } catch {}
    serverInstance = null;
  }
  if (ssdpInterval) {
    clearInterval(ssdpInterval);
    ssdpInterval = null;
  }
  if (ssdpSearchSocket) {
    try { ssdpSearchSocket.close(); } catch {}
    ssdpSearchSocket = null;
  }
  isRunning = false;
  console.log('DLNA Server stopped');
}
