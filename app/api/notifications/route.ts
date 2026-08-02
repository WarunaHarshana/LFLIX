import { NextResponse } from 'next/server';
import releaseMonitor from '@/lib/releaseMonitor';
import { apiErrorResponse, readJsonObject } from '@/lib/apiSecurity';

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
  } catch (e) {
    return apiErrorResponse(e);
  }
}

// PATCH — mark notification(s) as read
export async function PATCH(req: Request) {
  try {
    const body = await readJsonObject(req);
    // Optional array of IDs; if omitted or malformed, marks all as read.
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is number => Number.isInteger(id) && id > 0)
      : undefined;

    releaseMonitor.markAsRead(ids);

    return NextResponse.json({ success: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}

// DELETE — clear all notifications
export async function DELETE() {
  try {
    releaseMonitor.clearAll();
    return NextResponse.json({ success: true });
  } catch (e) {
    return apiErrorResponse(e);
  }
}
