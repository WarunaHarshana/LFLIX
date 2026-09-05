import { NextResponse } from 'next/server';
import { getAvailableNetworkIps, getLocalIpAddress } from '@/lib/network';

// Mark as dynamic for static export compatibility
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const host = req.headers.get('host') || '';
  let port = 3000;

  if (host.includes(':')) {
    const parsedPort = parseInt(host.split(':')[1], 10);
    if (Number.isInteger(parsedPort) && parsedPort > 0) {
      port = parsedPort;
    }
  } else if (process.env.PORT) {
    const envPort = parseInt(process.env.PORT, 10);
    if (Number.isInteger(envPort) && envPort > 0) {
      port = envPort;
    }
  }

  const allIps = getAvailableNetworkIps();
  const primaryIp = getLocalIpAddress();

  return NextResponse.json({
    ip: primaryIp,
    port,
    allIps,
  });
}
