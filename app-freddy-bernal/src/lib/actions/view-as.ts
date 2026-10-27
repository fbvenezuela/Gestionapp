'use server';

import { cookies } from 'next/headers';
import { getSession } from '../auth/session';
import { isTeamRole } from '../roles';

export async function setViewAs(role: string | null) {
  const s = await getSession();
  if (!s?.roles.includes('admin')) return;
  const store = await cookies();
  if (!isTeamRole(role)) store.delete('fb_view_as');
  else store.set('fb_view_as', role, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 8 * 3600 });
}
