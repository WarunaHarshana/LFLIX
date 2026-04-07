import { NextResponse } from 'next/server';
import releaseMonitor from '@/lib/releaseMonitor';

export const dynamic = 'force-dynamic';

// GET — fetch notifications
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const unreadOnly = searchParams.get('unread') === '1';

    const notifications = releaseMonitor.getNotifications(limit, unreadOnly);
    const unreadCount = releaseMonitor.getUnreadCount();

    return NextResponse.json({ notifications, unreadCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PATCH — mark notification(s) as read
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { ids } = body; // optional array of IDs; if omitted, marks all as read

    releaseMonitor.markAsRead(ids);

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE — clear all notifications
export async function DELETE() {
  try {
    releaseMonitor.clearAll();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
