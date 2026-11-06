'use server';

import { env } from '../env';
import { withSystem } from '../db';

// Demo only: the "test inbox" next to the sign-in form, so testers can read the code
// that would have been emailed. Returns nothing outside demo mode. Only sign-in codes, and only
// for a person of the team: this is a server action anyone can call with any address, and the
// demo's outbox also holds what the public website sent to whoever used its form (the security
// review of 06/11: «Recibimos tu solicitud…» to any address typed here).
export async function demoInbox(email: string): Promise<{ subject: string; text: string; at: string }[]> {
  if (env.dataMode !== 'demo') return [];
  return withSystem((sql) =>
    sql.query<{ subject: string; text: string; at: string }>(
      `select o.subject, o.text_body as text, to_char(o.created_at, 'HH24:MI:SS') as at from public.outbox o
        where o.to_email = lower($1) and o.template = 'login_code'
          and exists (select 1 from public.profiles p where p.email = lower($1) and p.active and p.deleted_at is null)
        order by o.created_at desc limit 3`,
      [String(email ?? '')],
    ),
  );
}
