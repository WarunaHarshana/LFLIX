import os from 'os';

export type NetworkIpInfo = {
  ip: string;
  name: string;
  type: 'Wi-Fi' | 'Ethernet' | 'Other';
  isPrimary: boolean;
};

const VIRTUAL_OR_VPN_PATTERNS = [
  'virtual',
  'vethernet',
  'vmware',
  'vmnet',
  'vbox',
  'virtualbox',
  'tailscale',
  'zerotier',
  'hamachi',
  'warp',
  'cloudflare',
  'tun',
  'tap',
  'wsl',
  'hyper-v',
  'docker',
  'container',
  'bridge',
  'teredo',
  'loopback',
  'pango',
  'nordlynx',
  'wireguard',
  'openvpn',
];

export function isVirtualOrVpnInterface(name: string): boolean {
  const lower = name.toLowerCase();
  return VIRTUAL_OR_VPN_PATTERNS.some((pattern) => lower.includes(pattern));
}

function getInterfaceType(name: string): 'Wi-Fi' | 'Ethernet' | 'Other' {
  const lower = name.toLowerCase();
  if (lower.includes('wi-fi') || lower.includes('wireless') || lower.includes('wlan')) {
    return 'Wi-Fi';
  }
  if (lower.includes('ethernet') || lower.includes('eth') || lower.includes('en')) {
    return 'Ethernet';
  }
  return 'Other';
}

function scoreIp(ip: string, name: string): number {
  let score = 0;

  // Heavily penalize virtual or VPN interface names
  if (isVirtualOrVpnInterface(name)) {
    score += 1000;
  }

  // CGNAT (e.g. Cloudflare WARP 100.96.x.x, Tailscale 100.x.x.x) - not accessible on LAN
  if (ip.startsWith('100.')) {
    score += 800;
  }

  // VirtualBox default host-only subnet (192.168.56.x)
  if (ip.startsWith('192.168.56.')) {
    score += 500;
  }

  // Standard home/office Wi-Fi and Ethernet LAN subnets
  if (ip.startsWith('192.168.')) {
    score += 10;
  } else if (ip.startsWith('10.')) {
    score += 20;
  } else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) {
    score += 30;
  } else {
    score += 200;
  }

  // Prefer Wi-Fi first for mobile devices, then Ethernet
  const lowerName = name.toLowerCase();
  if (lowerName.includes('wi-fi') || lowerName.includes('wireless') || lowerName.includes('wlan')) {
    score += 1;
  } else if (lowerName.includes('ethernet') || lowerName.includes('eth') || lowerName.includes('en')) {
    score += 2;
  } else {
    score += 5;
  }

  return score;
}

/**
 * Returns all active, non-internal IPv4 addresses sorted by likelihood of being the main LAN IP.
 */
export function getAvailableNetworkIps(
  customInterfaces?: NodeJS.Dict<os.NetworkInterfaceInfo[]>
): NetworkIpInfo[] {
  const interfaces = customInterfaces || os.networkInterfaces();
  const candidates: { ip: string; name: string; type: 'Wi-Fi' | 'Ethernet' | 'Other'; score: number }[] = [];

  for (const [name, iface] of Object.entries(interfaces)) {
    if (!iface) continue;

    for (const details of iface) {
      // Must be IPv4, non-internal, non-link-local, non-loopback
      if (
        details.family !== 'IPv4' ||
        details.internal ||
        details.address.startsWith('127.') ||
        details.address.startsWith('169.254.')
      ) {
        continue;
      }

      candidates.push({
        ip: details.address,
        name,
        type: getInterfaceType(name),
        score: scoreIp(details.address, name),
      });
    }
  }

  // Sort lowest score first
  candidates.sort((a, b) => a.score - b.score);

  if (candidates.length === 0) {
    return [
      {
        ip: 'localhost',
        name: 'Loopback',
        type: 'Other',
        isPrimary: true,
      },
    ];
  }

  return candidates.map((c, idx) => ({
    ip: c.ip,
    name: c.name,
    type: c.type,
    isPrimary: idx === 0,
  }));
}

/**
 * Returns the best local LAN IP address to share with mobile and other devices.
 */
export function getLocalIpAddress(customInterfaces?: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string {
  const all = getAvailableNetworkIps(customInterfaces);
  return all[0]?.ip || 'localhost';
}
