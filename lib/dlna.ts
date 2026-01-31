import { spawn } from 'child_process';
import http from 'http';
import os from 'os';
import db from './db';

// Get local IP
function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const details of iface || []) {
      if (details.family === 'IPv4' && !details.internal) {
        return details.address;
      }
    }
  }
  return '127.0.0.1';
}

// Simple DLNA/UPnP server for VLC discovery
class DlnaServer {
  private server: http.Server | null = null;
  private port: number = 3001; // Separate port for DLNA
  private ip: string = getLocalIp();

  async start() {
    if (this.server) return;

    this.server = http.createServer((req, res) => {
      this.handleRequest(req, res);
    });

    this.server.listen(this.port, () => {
      console.log(`DLNA Server running on http://${this.ip}:${this.port}`);
      this.broadcastSsdp();
    });

    // Broadcast SSDP every 30 seconds
    setInterval(() => this.broadcastSsdp(), 30000);
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = req.url || '/';
    
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/xml');

    if (url === '/description.xml') {
      // Device description for UPnP discovery
      res.end(this.getDeviceDescription());
    } else if (url === '/ContentDirectory/scpd') {
      // Content directory service
      res.end(this.getContentDirectoryScpd());
    } else if (url === '/ContentDirectory/control') {
      // Handle browse requests
      this.handleBrowse(req, res);
    } else if (url.startsWith('/media/')) {
      // Stream media file
      this.streamMedia(url, res);
    } else {
      res.statusCode = 404;
      res.end('Not Found');
    }
  }

  private getDeviceDescription(): string {
    return `<?xml version="1.0"?>
<root xmlns="urn:schemas-upnp-org:device-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <device>
    <deviceType>urn:schemas-upnp-org:device:MediaServer:1</deviceType>
    <friendlyName>LocalFlix Media Server</friendlyName>
    <manufacturer>LocalFlix</manufacturer>
    <manufacturerURL>https://github.com/WarunaHarshana/localflix</manufacturerURL>
    <modelName>LocalFlix</modelName>
    <modelNumber>1.0</modelNumber>
    <modelURL>https://github.com/WarunaHarshana/localflix</modelURL>
    <serialNumber>001</serialNumber>
    <UDN>uuid:localflix-media-server-001</UDN>
    <serviceList>
      <service>
        <serviceType>urn:schemas-upnp-org:service:ContentDirectory:1</serviceType>
        <serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>
        <SCPDURL>/ContentDirectory/scpd</SCPDURL>
        <controlURL>/ContentDirectory/control</controlURL>
        <eventSubURL>/ContentDirectory/event</eventSubURL>
      </service>
    </serviceList>
  </device>
</root>`;
  }

  private getContentDirectoryScpd(): string {
    return `<?xml version="1.0"?>
<scpd xmlns="urn:schemas-upnp-org:service-1-0">
  <specVersion>
    <major>1</major>
    <minor>0</minor>
  </specVersion>
  <actionList>
    <action>
      <name>Browse</name>
      <argumentList>
        <argument>
          <name>ObjectID</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_ObjectID</relatedStateVariable>
        </argument>
        <argument>
          <name>BrowseFlag</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_BrowseFlag</relatedStateVariable>
        </argument>
        <argument>
          <name>Filter</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_Filter</relatedStateVariable>
        </argument>
        <argument>
          <name>StartingIndex</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_Index</relatedStateVariable>
        </argument>
        <argument>
          <name>RequestedCount</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable>
        </argument>
        <argument>
          <name>SortCriteria</name>
          <direction>in</direction>
          <relatedStateVariable>A_ARG_TYPE_SortCriteria</relatedStateVariable>
        </argument>
        <argument>
          <name>Result</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_Result</relatedStateVariable>
        </argument>
        <argument>
          <name>NumberReturned</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable>
        </argument>
        <argument>
          <name>TotalMatches</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_Count</relatedStateVariable>
        </argument>
        <argument>
          <name>UpdateID</name>
          <direction>out</direction>
          <relatedStateVariable>A_ARG_TYPE_UpdateID</relatedStateVariable>
        </argument>
      </argumentList>
    </action>
  </actionList>
</scpd>`;
  }

  private handleBrowse(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        // Parse SOAP request
        const objectId = body.match(/<ObjectID>(.*?)<\/ObjectID>/)?.[1] || '0';
        
        // Get movies from database
        const movies = db.prepare('SELECT id, title, filePath FROM movies ORDER BY title').all() as { id: number; title: string; filePath: string }[];
        
        let didl = '<?xml version="1.0"?><DIDL-Lite xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:dc="http://purl.org/dc/elements/1.1/">';
        
        if (objectId === '0') {
          // Root container - list movies
          for (const movie of movies) {
            const ext = movie.filePath.split('.').pop()?.toLowerCase() || 'mp4';
            const mimeType = ext === 'mp4' ? 'video/mp4' : ext === 'mkv' ? 'video/x-matroska' : 'video/mp4';
            
            didl += `<item id="${movie.id}" parentID="0" restricted="1">`;
            didl += `<dc:title>${this.escapeXml(movie.title)}</dc:title>`;
            didl += `<upnp:class>object.item.videoItem</upnp:class>`;
            didl += `<res protocolInfo="http-get:*:${mimeType}:*">http://${this.ip}:${this.port}/media/${movie.id}</res>`;
            didl += `</item>`;
          }
        }
        
        didl += '</DIDL-Lite>';
        
        const response = `<?xml version="1.0"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
  <s:Body>
    <u:BrowseResponse xmlns:u="urn:schemas-upnp-org:service:ContentDirectory:1">
      <Result>${this.escapeXml(didl)}</Result>
      <NumberReturned>${movies.length}</NumberReturned>
      <TotalMatches>${movies.length}</TotalMatches>
      <UpdateID>1</UpdateID>
    </u:BrowseResponse>
  </s:Body>
</s:Envelope>`;
        
        res.end(response);
      } catch (e) {
        console.error('Browse error:', e);
        res.statusCode = 500;
        res.end('Error');
      }
    });
  }

  private streamMedia(url: string, res: http.ServerResponse) {
    const id = parseInt(url.split('/').pop() || '0', 10);
    if (!id) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    try {
      const movie = db.prepare('SELECT filePath FROM movies WHERE id = ?').get(id) as { filePath: string } | undefined;
      if (!movie) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const fs = require('fs');
      const path = movie.filePath.replace(/\//g, '\\');
      
      if (!fs.existsSync(path)) {
        res.statusCode = 404;
        res.end('File not found');
        return;
      }

      const stat = fs.statSync(path);
      const ext = path.split('.').pop()?.toLowerCase() || 'mp4';
      const mimeType = ext === 'mp4' ? 'video/mp4' : ext === 'mkv' ? 'video/x-matroska' : 'video/mp4';

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Content-Length', stat.size);
      res.setHeader('Accept-Ranges', 'bytes');

      const stream = fs.createReadStream(path);
      stream.pipe(res);
    } catch (e) {
      console.error('Stream error:', e);
      res.statusCode = 500;
      res.end('Error');
    }
  }

  private broadcastSsdp() {
    const dgram = require('dgram');
    const socket = dgram.createSocket('udp4');
    
    const message = `NOTIFY * HTTP/1.1\r
HOST: 239.255.255.250:1900\r
CACHE-CONTROL: max-age=1800\r
LOCATION: http://${this.ip}:${this.port}/description.xml\r
NT: urn:schemas-upnp-org:device:MediaServer:1\r
NTS: ssdp:alive\r
SERVER: LocalFlix/1.0 UPnP/1.0\r
USN: uuid:localflix-media-server-001::urn:schemas-upnp-org:device:MediaServer:1\r
\r
`;

    socket.bind(() => {
      socket.setBroadcast(true);
      socket.send(message, 1900, '239.255.255.250', (err: any) => {
        if (err) console.error('SSDP broadcast error:', err);
        socket.close();
      });
    });
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

// Singleton instance
export const dlnaServer = new DlnaServer();
