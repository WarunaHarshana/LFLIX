import { describe, expect, it } from 'vitest';
import type os from 'os';
import { getAvailableNetworkIps, getLocalIpAddress, isVirtualOrVpnInterface } from '@/lib/network';
import { GET as getIpRoute } from '@/app/api/ip/route';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

describe('Network Interface Prioritization', () => {
  it('identifies virtual and VPN interfaces correctly', () => {
    expect(isVirtualOrVpnInterface('CloudflareWARP')).toBe(true);
    expect(isVirtualOrVpnInterface('vEthernet (Default Switch)')).toBe(true);
    expect(isVirtualOrVpnInterface('VirtualBox Host-Only Ethernet Adapter')).toBe(true);
    expect(isVirtualOrVpnInterface('tailscale0')).toBe(true);
    expect(isVirtualOrVpnInterface('docker0')).toBe(true);
    expect(isVirtualOrVpnInterface('Wi-Fi')).toBe(false);
    expect(isVirtualOrVpnInterface('Ethernet')).toBe(false);
    expect(isVirtualOrVpnInterface('en0')).toBe(false);
    expect(isVirtualOrVpnInterface('wlan0')).toBe(false);
  });

  it('prioritizes genuine LAN Wi-Fi and Ethernet over virtual adapters', () => {
    const mockInterfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
      'CloudflareWARP': [
        {
          address: '100.96.0.4',
          netmask: '255.255.255.255',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: false,
          cidr: '100.96.0.4/32',
        },
      ],
      'vEthernet (WSL)': [
        {
          address: '172.21.64.1',
          netmask: '255.255.240.0',
          family: 'IPv4',
          mac: '00:15:5d:00:00:01',
          internal: false,
          cidr: '172.21.64.1/20',
        },
      ],
      'VirtualBox Host-Only Network': [
        {
          address: '192.168.56.1',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '0a:00:27:00:00:00',
          internal: false,
          cidr: '192.168.56.1/24',
        },
      ],
      'Ethernet': [
        {
          address: '192.168.1.11',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '70:85:c2:5b:6a:5e',
          internal: false,
          cidr: '192.168.1.11/24',
        },
      ],
      'Wi-Fi': [
        {
          address: '192.168.1.25',
          netmask: '255.255.255.0',
          family: 'IPv4',
          mac: '10:20:30:40:50:60',
          internal: false,
          cidr: '192.168.1.25/24',
        },
      ],
    };

    const sorted = getAvailableNetworkIps(mockInterfaces);
    expect(sorted.length).toBe(5);

    // Wi-Fi is ranked first for mobile connectivity, followed by Ethernet
    expect(sorted[0].name).toBe('Wi-Fi');
    expect(sorted[0].ip).toBe('192.168.1.25');
    expect(sorted[0].isPrimary).toBe(true);

    expect(sorted[1].name).toBe('Ethernet');
    expect(sorted[1].ip).toBe('192.168.1.11');

    // Virtual/VPN adapters must be at the bottom
    const bottomNames = sorted.slice(2).map((s) => s.name);
    expect(bottomNames).toContain('CloudflareWARP');
    expect(bottomNames).toContain('vEthernet (WSL)');
    expect(bottomNames).toContain('VirtualBox Host-Only Network');

    // getLocalIpAddress returns top candidate
    expect(getLocalIpAddress(mockInterfaces)).toBe('192.168.1.25');
  });

  it('filters out loopback, link-local, and IPv6 addresses', () => {
    const mockInterfaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = {
      'Loopback': [
        {
          address: '127.0.0.1',
          netmask: '255.0.0.0',
          family: 'IPv4',
          mac: '00:00:00:00:00:00',
          internal: true,
          cidr: '127.0.0.1/8',
        },
        {
          address: '::1',
          netmask: 'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff',
          family: 'IPv6',
          mac: '00:00:00:00:00:00',
          internal: true,
          cidr: '::1/128',
          scopeid: 0,
        },
      ],
      'Auto-IP': [
        {
          address: '169.254.10.20',
          netmask: '255.255.0.0',
          family: 'IPv4',
          mac: '00:11:22:33:44:55',
          internal: false,
          cidr: '169.254.10.20/16',
        },
      ],
    };

    const ips = getAvailableNetworkIps(mockInterfaces);
    expect(ips).toEqual([
      {
        ip: 'localhost',
        name: 'Loopback',
        type: 'Other',
        isPrimary: true,
      },
    ]);
    expect(getLocalIpAddress(mockInterfaces)).toBe('localhost');
  });
});

describe('/api/ip endpoint', () => {
  it('returns valid IP, dynamic port from host header, and list of candidates', async () => {
    const req = new NextRequest('http://192.168.1.11:4000/api/ip', {
      headers: {
        host: '192.168.1.11:4000',
      },
    });

    const res = await getIpRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty('ip');
    expect(data).toHaveProperty('port', 4000);
    expect(data).toHaveProperty('allIps');
    expect(Array.isArray(data.allIps)).toBe(true);
    expect(data.ip).not.toBe('100.96.0.4'); // Must not pick Cloudflare WARP on this host
  });

  it('allows unauthenticated access in middleware for /api/ip and /api/dlna', async () => {
    const ipReq = new NextRequest('http://localhost:3000/api/ip');
    const ipRes = await middleware(ipReq);
    expect(ipRes.status).toBe(200);

    const dlnaReq = new NextRequest('http://localhost:3000/api/dlna');
    const dlnaRes = await middleware(dlnaReq);
    expect(dlnaRes.status).toBe(200);
  });
});
