'use server';

import { cookies } from 'next/headers';
import { getSession } from '../auth/session';
import { INVITABLE_ROLES, type Role } from '../roles';

export async function setViewAs(role: string | null) {
  const s = await getSession();
  if (!s?.roles.includes('admin')) return;
  const store = await cookies();
  if (!role || !INVITABLE_ROLES.includes(role as Role)) store.delete('fb_view_as');
  else store.set('fb_view_as', role, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 8 * 3600 });
}
