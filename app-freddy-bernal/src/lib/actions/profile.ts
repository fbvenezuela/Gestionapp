'use server';

import { z } from 'zod';
import { act } from './run';

export async function markAllRead() {
  return act(z.object({}), {}, async (sql) => {
    await sql.query(`update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null`);
  }, { revalidate: ['/avisos'] });
}

export async function updateProfile(raw: unknown) {
  return act(
    z.object({ fullName: z.string().trim().min(2).max(120), phone: z.string().trim().max(40).default(''), prefs: z.record(z.string(), z.boolean()).default({}) }),
    raw,
    async (sql, i) => {
      await sql.query(`update public.profiles set full_name = $1, phone = nullif($2, ''), notify_prefs = $3::text::jsonb where id = auth.uid()`, [i.fullName, i.phone, JSON.stringify(i.prefs)]);
    },
    { revalidate: ['/perfil'] },
  );
}
