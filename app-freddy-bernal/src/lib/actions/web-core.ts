import 'server-only';
import { notify, usersWithRole } from '../notify';
import { revalidateWebItem, revalidateWebRedirects } from '../web/revalidate';
import { WEB_KIND_LABEL, type WebKind } from '../web/schema';
import { ADMIN_WEB } from '../web/cms/kinds';

// What the website's actions do after the database committed (src/lib/actions/web.ts, web-site.ts): refresh the
// public pages that show the item (cached as anon, src/lib/web/revalidate.ts) and tell the people of the flow
// (in-app notice and phone, never email). A notice that cannot be sent never undoes or fails what was done.

export const CONFLICT_TEXT = 'Alguien guardó cambios en este contenido mientras lo editabas. Copia lo tuyo y vuelve a abrirlo para ver lo último.';
export const NOT_FOUND_TEXT = 'No encontramos ese contenido.';

/** The public pages of an item (and of its old address, after a change of address) show the change on the next visit. */
export function refreshPublic(kind: WebKind, ...slugs: (string | null | undefined)[]): void {
  const list = [...new Set(slugs.filter((s): s is string => !!s))];
  if (!list.length) revalidateWebItem(kind);
  for (const slug of list) revalidateWebItem(kind, slug);
}

export function refreshRedirects(): void {
  revalidateWebRedirects();
}

async function safely(what: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (e) {
    console.error(`[web] aviso de ${what} no enviado:`, (e as Error).message);
  }
}

type ItemRef = { id: string; kind: WebKind; title: string; draftVersion: number };

/** «Por aprobar»: the web's publishers learn that something waits (the boss sees it in the administrator). */
export async function noticeSubmitted(item: ItemRef, actorId: string): Promise<void> {
  await safely('revisión', async () => {
    const to = (await usersWithRole('web_publisher')).filter((id) => id !== actorId);
    if (!to.length) return;
    await notify({
      userIds: to,
      kind: 'web_review',
      title: 'Hay contenido de la web por aprobar',
      body: `${WEB_KIND_LABEL[item.kind]}: ${item.title}`,
      link: ADMIN_WEB.review(item.id),
      key: `web-review:${item.id}:${item.draftVersion}`,
    });
  });
}

/** Back to whoever sent it: published (or scheduled) or returned with a comment. */
export async function noticeDecision(item: ItemRef, to: string | null, actorId: string, decision: 'published' | 'scheduled' | 'returned', note?: string): Promise<void> {
  if (!to || to === actorId) return;
  await safely('decisión', () =>
    notify({
      userIds: [to],
      kind: decision === 'returned' ? 'web_returned' : 'web_published',
      title:
        decision === 'returned' ? 'Te devolvieron un contenido de la web' : decision === 'scheduled' ? 'Tu contenido de la web quedó programado' : 'Tu contenido ya está en la web',
      body: decision === 'returned' && note ? `${item.title}: ${note.slice(0, 200)}` : item.title,
      link: ADMIN_WEB.edit(item.id),
      key: `web-${decision}:${item.id}:${item.draftVersion}`,
    }),
  );
}
