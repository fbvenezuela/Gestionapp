'use server';

import { env } from '../env';
import { withSystem } from '../db';

// Demo only: the "test inbox" next to the sign-in form, so testers can read the code
// that would have been emailed. Returns nothing outside demo mode.
export async function demoInbox(email: string): Promise<{ subject: string; text: string; at: string }[]> {
  if (env.dataMode !== 'demo') return [];
  return withSystem((sql) =>
    sql.query<{ subject: string; text: string; at: string }>(
      `select subject, text_body as text, to_char(created_at, 'HH24:MI:SS') as at from public.outbox
        where to_email = lower($1) order by created_at desc limit 3`,
      [email],
    ),
  );
}
