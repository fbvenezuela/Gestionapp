import type { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { withUser } from '@/lib/db';
import { friendlyDbError } from '@/lib/db/core';
import { buildExport } from '@/lib/data/attention-export';
import { deskAccess, parseInboxFilters } from '@/lib/domain/attention';

const TEXT = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex, nofollow' };
const text = (status: number, body: string) => new Response(body, { status, headers: TEXT });

// «Exportar (CSV)» of the attention desk (design §5): the inbox's filters in the address. The person's session with its
// second factor and one of the two roles that export (the coordinator; the auditor, never with the contact), checked
// here AND in the database (RLS on every row, log_attention_export() refuses anyone else, request_contact() refuses the
// auditor). A link from another site does not export (Sec-Fetch-Site): the file and its audit row are made only from
// this app. Never cached, never indexed.
export async function GET(req: NextRequest) {
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return text(403, 'No permitido.');
  const s = await getSession();
  if (!s || !s.mfaOk) return text(401, 'Entra de nuevo.');
  const access = deskAccess(s.roles);
  if (!access.exports) return text(403, 'Exportar es de la coordinación y de auditoría.');
  const f = parseInboxFilters(Object.fromEntries(req.nextUrl.searchParams));
  const withContact = access.exportsContacts && req.nextUrl.searchParams.get('contacto') === '1';
  try {
    const out = await withUser(s.claims, (sql) => buildExport(sql, f, s.userId, withContact));
    return new Response(out.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${out.filename}"`,
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    const msg = friendlyDbError(e);
    console.error('[atencion] exportar:', (e as Error).message);
    return text((e as { code?: string })?.code === '42501' ? 403 : 500, msg);
  }
}
