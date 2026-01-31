import http from 'http';
import dgram from 'dgram';
import os from 'os';
import db from './db';

// Global state to track if server is running
let isRunning = false;
let serverInstance: http.Server | null = null;
let ssdpInterval: NodeJS.Timeout | null = null;

// Get local IP
function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const details of iface || []) {
      if (details.family === 'IPv4' && !details.internal && !details.address.startsWith('169.254')) {
        return details.address;
      }
    }
  }
  return '127.0.0.1';
}

const PORT = 3001;
const IP = getLocalIp();

function getDeviceDescription(): string {
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
    <presentationURL>http://${IP}:3000</presentationURL>
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
  console.log('DLNA Request:', url);
  
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
    streamMedia(url, res);
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
}

function handleBrowse(req: http.IncomingMessage, res: http.ServerResponse) {
  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    try {
      console.log('Browse request:', body.substring(0, 200));
      
      const movies = db.prepare('SELECT id, title, filePath FROM movies ORDER BY title').all() as { id: number; title: string; filePath: string }[];
      
      let result = '&lt;?xml version="1.0"?&gt;&lt;DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"&gt;';
      
      for (const movie of movies) {
        const ext = movie.filePath.split('.').pop()?.toLowerCase() || 'mp4';
        const mime = ext === 'mp4' ? 'video/mp4' : 'video/mpeg';
        result += `&lt;item id="movie_${movie.id}" parentID="0" restricted="1"&gt;`;
        result += `&lt;dc:title&gt;${escapeXml(movie.title)}&lt;/dc:title&gt;`;
        result += `&lt;upnp:class&gt;object.item.videoItem&lt;/upnp:class&gt;`;
        result += `&lt;res protocolInfo="http-get:*:${mime}:*"&gt;http://${IP}:${PORT}/media/${movie.id}&lt;/res&gt;`;
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
      console.error('Browse error:', e);
      res.writeHead(500);
      res.end('Error');
    }
  });
}

function streamMedia(url: string, res: http.ServerResponse) {
  const id = parseInt(url.split('/').pop() || '0', 10);
  if (!id) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  try {
    const fs = require('fs');
    const movie = db.prepare('SELECT filePath FROM movies WHERE id = ?').get(id) as { filePath: string } | undefined;
    if (!movie) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const path = movie.filePath.replace(/\//g, '\\');
    if (!fs.existsSync(path)) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }

    const stat = fs.statSync(path);
    const ext = path.split('.').pop()?.toLowerCase() || 'mp4';
    const mimeType = ext === 'mp4' ? 'video/mp4' : ext === 'mkv' ? 'video/x-matroska' : 'video/mpeg';

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes'
    });

    fs.createReadStream(path).pipe(res);
  } catch (e) {
    console.error('Stream error:', e);
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
  })[c] || c);
}

function sendSsdpNotify() {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  
  const messages = [
    `NOTIFY * HTTP/1.1\r\n` +
    `HOST: 239.255.255.250:1900\r\n` +
    `CACHE-CONTROL: max-age=1800\r\n` +
    `LOCATION: http://${IP}:${PORT}/description.xml\r\n` +
    `NT: urn:schemas-upnp-org:device:MediaServer:1\r\n` +
    `NTS: ssdp:alive\r\n` +
    `SERVER: LocalFlix/1.0 UPnP/1.0 DLNADOC/1.50\r\n` +
    `USN: uuid:localflix-001::urn:schemas-upnp-org:device:MediaServer:1\r\n` +
    `\r\n`,
    
    `NOTIFY * HTTP/1.1\r\n` +
    `HOST: 239.255.255.250:1900\r\n` +
    `CACHE-CONTROL: max-age=1800\r\n` +
    `LOCATION: http://${IP}:${PORT}/description.xml\r\n` +
    `NT: uuid:localflix-001\r\n` +
    `NTS: ssdp:alive\r\n` +
    `SERVER: LocalFlix/1.0 UPnP/1.0 DLNADOC/1.50\r\n` +
    `USN: uuid:localflix-001\r\n` +
    `\r\n`,
    
    `NOTIFY * HTTP/1.1\r\n` +
    `HOST: 239.255.255.250:1900\r\n` +
    `CACHE-CONTROL: max-age=1800\r\n` +
    `LOCATION: http://${IP}:${PORT}/description.xml\r\n` +
    `NT: upnp:rootdevice\r\n` +
    `NTS: ssdp:alive\r\n` +
    `SERVER: LocalFlix/1.0 UPnP/1.0 DLNADOC/1.50\r\n` +
    `USN: uuid:localflix-001::upnp:rootdevice\r\n` +
    `\r\n`
  ];

  socket.bind(() => {
    socket.setBroadcast(true);
    socket.setMulticastTTL(4);
    
    messages.forEach((msg, i) => {
      setTimeout(() => {
        socket.send(msg, 1900, '239.255.255.250', (err: any) => {
          if (err) console.error('SSDP error:', err);
        });
      }, i * 100);
    });
    
    setTimeout(() => socket.close(), 1000);
  });
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
      serverInstance = http.createServer(handleRequest);
      
      serverInstance.listen(PORT, () => {
        console.log(`DLNA Server started on http://${IP}:${PORT}`);
        isRunning = true;
        
        // Send SSDP broadcasts
        sendSsdpNotify();
        
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
    serverInstance.close();
    serverInstance = null;
  }
  if (ssdpInterval) {
    clearInterval(ssdpInterval);
    ssdpInterval = null;
  }
  isRunning = false;
  console.log('DLNA Server stopped');
}

export function getDlnaStatus(): boolean {
  return isRunning;
}
