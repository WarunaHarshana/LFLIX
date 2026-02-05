import { NextResponse } from 'next/server';
import os from 'os';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  
  // Priority order for interfaces
  const priorityNames = ['Wi-Fi', 'Ethernet', 'wlan', 'eth', 'en'];
  
  // Collect all IPv4 addresses
  const addresses: { ip: string; name: string; priority: number }[] = [];
  
  for (const [name, iface] of Object.entries(interfaces)) {
    if (!iface) continue;
    
    for (const details of iface) {
      // Skip internal and non-IPv4 addresses
      if (details.family !== 'IPv4' || details.internal) continue;
      
      // Skip virtual interfaces
      if (name.includes('Virtual') || name.includes('vEthernet')) continue;
      
      // Determine priority
      let priority = 999;
      for (let i = 0; i < priorityNames.length; i++) {
        if (name.toLowerCase().includes(priorityNames[i].toLowerCase())) {
          priority = i;
          break;
        }
      }
      
      addresses.push({ ip: details.address, name, priority });
    }
  }
  
  // Sort by priority and return best match
  addresses.sort((a, b) => a.priority - b.priority);
  
  // Return first non-local address
  for (const addr of addresses) {
    if (!addr.ip.startsWith('127.')) {
      return addr.ip;
    }
  }
  
  return 'localhost';
}

export async function GET() {
  const ip = getLocalIpAddress();
  return NextResponse.json({ ip, port: 3000 });
}
