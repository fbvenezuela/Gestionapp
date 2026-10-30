import { db } from '@/lib/auth/session';
import { unreadChannels } from '@/lib/data/chat';
import { json, teamSession } from '../route-core';

// The number on the envelope at the top (R3, D-56): how many of my channels have something new. Every 30 s while
// the screen is in view. As the person (RLS).
export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await teamSession();
  if (!gate.ok) return gate.res;
  const n = await db(gate.s, (sql) => unreadChannels(sql));
  return json({ n });
}
