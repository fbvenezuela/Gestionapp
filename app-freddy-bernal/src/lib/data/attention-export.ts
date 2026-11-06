import 'server-only';
import type { Sql } from '../db/core';
import { toCsv } from '../participation/csv';
import { openContact } from '../participation/contact-crypto';
import { fmtDateTime, today } from '../time';
import { CONTACT_CHANNEL_LABEL, type ContactChannel } from '../participation/input';
import { REQUEST_PRIORITY_LABEL, REQUEST_STATE_LABEL, REQUEST_TYPE_LABEL, type InboxFilters } from '../domain/attention';
import { exportRows, type ExportRow } from './attention';

// The attention desk's CSV (design §5): the inbox's filters applied, read as the person (RLS decides which cases: the
// auditor never gets a denuncia), UTF-8 with its BOM and «;» between cells so Excel in Spanish opens it straight away
// with the accents right (a «,» is the decimal separator there), every cell guarded against formulas (toCsv,
// src/lib/participation/csv.ts). The citizen's contact only for the coordinator who asks for it: each case's contact
// goes through request_contact(), which records who looked, one row per case. Every export leaves its own row in the
// audit log (log_attention_export()). Never the description, the messages or the files.

const HEADER = [
  'Código', 'Tipo', 'Categoría', 'Estado', 'Prioridad', 'Municipio', 'Parroquia', 'Sector', 'Área', 'Responsable', 'Llegó', 'Fecha comprometida',
  'Primera respuesta', 'Resuelta', 'Vencida', 'Apoyos', 'Confirmación de la persona', 'Unida a', 'Spam', 'Título',
];
const CONTACT_HEADER = ['Nombre', 'Correo', 'Teléfono', 'Prefiere'];

const CONFIRMATION: Record<string, string> = { resolved: 'Dijo que se resolvió', not_resolved: 'Dijo que no se resolvió' };

export function exportLine(r: ExportRow): unknown[] {
  return [
    r.reference, REQUEST_TYPE_LABEL[r.type], r.category, REQUEST_STATE_LABEL[r.state], REQUEST_PRIORITY_LABEL[r.priority], r.municipality, r.parish,
    r.sector, r.area, r.assignee, fmtDateTime(r.createdAt), r.dueAt ? fmtDateTime(r.dueAt) : '', r.firstResponseAt ? fmtDateTime(r.firstResponseAt) : '',
    r.resolvedAt ? fmtDateTime(r.resolvedAt) : '', r.overdue, r.supports, r.confirmation ? (CONFIRMATION[r.confirmation] ?? '') : '', r.duplicateOf ?? '',
    r.spam, r.title,
  ];
}

/** The filters as they go into the audit log (what was exported, never who it was about). */
export function filtersForLog(f: InboxFilters): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) if (k !== 'page' && k !== 'view' && v !== null && v !== '' && v !== false) out[k] = v;
  return out;
}

/** The file (and how many rows), read and logged inside the person's transaction. */
export async function buildExport(sql: Sql, f: InboxFilters, userId: string, withContact: boolean): Promise<{ csv: string; rows: number; filename: string }> {
  const rows = await exportRows(sql, f, userId);
  const lines: unknown[][] = [];
  for (const r of rows) {
    const line = exportLine(r);
    if (withContact) {
      const c = await sql.one<{ name_enc: string | null; email_enc: string | null; phone_enc: string | null; preferred_channel: string }>(
        `select name_enc, email_enc, phone_enc, preferred_channel from public.request_contact($1)`,
        [r.id],
      );
      const o = c ? openContact(c) : null;
      line.push(o?.name ?? '', o?.email ?? '', o?.phone ?? '', o ? (CONTACT_CHANNEL_LABEL[o.preferredChannel as ContactChannel] ?? '') : '');
    }
    lines.push(line);
  }
  await sql.query(`select public.log_attention_export($1, $2::text::jsonb, $3)`, [rows.length, JSON.stringify(filtersForLog(f)), withContact]);
  return {
    csv: toCsv(withContact ? [...HEADER, ...CONTACT_HEADER] : HEADER, lines),
    rows: rows.length,
    filename: `atencion-${today().toISODate()}${withContact ? '-con-contacto' : ''}.csv`,
  };
}
