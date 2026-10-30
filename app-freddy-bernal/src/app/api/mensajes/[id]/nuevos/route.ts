import type { NextRequest } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/auth/session';
import { messagesSince, wasRemoved } from '@/lib/data/chat';
import { gone, json, notFound, teamSession } from '../../route-core';

// What is new in an open channel (R3, D-56): the phone asks every 5 s while the screen is in view. As the person
// (RLS: who is in the channel now, with 2FA). A channel they cannot read is 404, like one that does not exist, and the
// screen keeps asking (in the demo it may have been made on another server, D-88); only when the database says the boss
// took them out (chat_was_removed) is it 410, and the screen says «Ya no estás en este canal.» and stops asking.
export const dynamic = 'force-dynamic';

const UUID = z.string().uuid();
const AFTER = z.object({ despues: z.string().datetime({ offset: true }), id: z.string().uuid() });

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await teamSession();
  if (!gate.ok) return gate.res;
  const { id } = await params;
  if (!UUID.safeParse(id).success) return notFound();
  const q = req.nextUrl.searchParams;
  let after: { at: string; id: string } | null = null;
  if (q.has('despues') || q.has('id')) {
    const p = AFTER.safeParse({ despues: q.get('despues'), id: q.get('id') });
    if (!p.success) return notFound();
    after = { at: p.data.despues, id: p.data.id };
  }
  const r = await db(gate.s, async (sql) => {
    const items = await messagesSince(sql, gate.s, id, after);
    return items ? { items } : { removed: await wasRemoved(sql, id) };
  });
  if ('items' in r) return json({ items: r.items });
  return r.removed ? gone() : notFound();
}
