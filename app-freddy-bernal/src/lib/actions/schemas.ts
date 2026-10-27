import 'server-only';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { UserError } from './run';
import type { Sql } from '../db';
import { TZ } from '../time';
import { DATED, MAX_TITLE, alwaysWhen } from '@/lib/domain/event-title';
import { MARKS } from '@/lib/data/ficha-labels';
import { cleanMarks, clearMarked, fromLocalDateTime, type FieldDef, type FormValues, type Marks } from '@/lib/domain/ficha-fields';
import { normalizeParish } from '@/lib/domain/territory';

// Input shapes shared by several server actions. NOT a 'use server' file: those may export only actions.

export const text = (max: number) => z.string().trim().max(max).default('');

// A title (an event's, an obra's name, a report's activity) never carries a date or a time (rule 4): the checks
// are in domain/event-title.ts.
export const titleOf = (empty = 'Escribe un título.') =>
  z
    .string()
    .trim()
    .min(3, empty)
    .max(MAX_TITLE, 'Máximo 140 caracteres.')
    // Zod still runs a refine after .max fails: never feed the date patterns an over-long title.
    .refine((t) => t.length > MAX_TITLE || !alwaysWhen(t), DATED);

export const titleField = titleOf();

export const scheduleShape = {
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Elige la fecha.'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Elige la hora.'),
  durationMin: z.coerce.number().int().min(15, 'Mínimo 15 minutos.').max(24 * 60),
  exactAddress: text(500),
  directions: text(2000),
  siteContacts: text(1000),
};

export function toRange(date: string, time: string, durationMin: number) {
  const start = DateTime.fromISO(`${date}T${time}`, { zone: TZ });
  if (!start.isValid) throw new UserError('La fecha u hora no es válida.');
  return { starts: start.toUTC().toISO()!, ends: start.plus({ minutes: durationMin }).toUTC().toISO()! };
}

// ---------------------------------------------------------------------------
// Fichas (obra and community report): every field as the form sends it (text), checked against its definition
// (domain/ficha-fields.ts) and turned into what the database stores.
// ---------------------------------------------------------------------------
export const marksSchema = z.record(z.string().regex(/^[a-z][a-z0-9_]{0,59}$/), z.enum(MARKS)).default({});
export const formValuesSchema = z.record(z.string().max(60), z.union([z.string().max(10_000), z.number(), z.null()])).default({});

export const PHONE = /^[0-9+() .-]*$/;

const asText = z.preprocess((v) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(v) : v), z.string());

function fieldSchema(d: FieldDef): z.ZodType<unknown> {
  const L = `«${d.label}»`;
  const max = d.max ?? 200;
  const trimmed = z.string().trim();
  switch (d.type) {
    case 'title':
      return asText.pipe(titleOf(`Escribe ${L}.`));
    case 'municipality':
      return asText.pipe(trimmed.min(1, 'Elige el municipio.').max(80, 'Elige el municipio de la lista.'));
    case 'parish':
      return asText.pipe(trimmed.max(max, `${L}: máximo ${max} caracteres.`)).transform(normalizeParish);
    case 'short':
    case 'long':
      return asText.pipe(trimmed.max(max, `${L}: máximo ${max} caracteres.`));
    case 'phone':
      return asText.pipe(trimmed.max(40, `${L}: máximo 40 caracteres.`).regex(PHONE, `${L}: solo números, espacios, +, guiones y paréntesis.`));
    case 'url':
      return asText.pipe(trimmed.max(max, `${L}: máximo ${max} caracteres.`).refine((v) => v === '' || /^https:\/\/\S+$/.test(v), `${L}: el enlace empieza con https://`));
    case 'int':
      return asText
        .pipe(trimmed.refine((v) => v === '' || /^\d{1,9}$/.test(v.replace(/[.\s]/g, '')), `${L}: escribe solo el número, sin letras.`))
        .transform((v) => (v === '' ? null : Number(v.replace(/[.\s]/g, ''))));
    case 'pct':
      return asText
        .pipe(trimmed.refine((v) => v === '' || (/^\d{1,3}$/.test(v) && Number(v) <= 100), `${L}: un número del 0 al 100.`))
        .transform((v) => (v === '' ? null : Number(v)));
    case 'date':
      return asText
        .pipe(trimmed.refine((v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && DateTime.fromISO(v, { zone: TZ }).isValid), `${L}: elige la fecha.`))
        .refine((v) => !d.required || v !== '', `${L}: elige la fecha.`)
        .transform((v) => (v === '' ? null : v));
    case 'datetime':
      return asText
        .pipe(trimmed.refine((v) => v === '' || fromLocalDateTime(v) !== null, `${L}: elige la fecha y la hora.`))
        .refine((v) => !d.required || v !== '', `${L}: elige la fecha y la hora.`)
        .transform((v) => fromLocalDateTime(v));
    case 'choice':
      return asText
        .pipe(trimmed.refine((v) => v === '' || (d.options ?? []).includes(v), `${L}: elige una opción de la lista.`))
        .refine((v) => !d.required || v !== '', `${L}: elige una opción.`)
        .transform((v) => (v === '' ? (d.emptyAs ?? null) : v));
  }
}

export type ParsedFicha = { main: Record<string, unknown>; priv: Record<string, unknown>; marks: { main: Marks; priv: Marks }; values: FormValues };

// The values of a ficha form: marked fields emptied first (a leftover typed value never blocks «No aplica»), then
// each field checked; split into the main table and the private one (contacts). Throws UserError in Spanish.
export function parseFicha(defs: FieldDef[], rawValues: Record<string, unknown>, rawMarks: Record<string, unknown>): ParsedFicha {
  const marks = cleanMarks(defs, rawMarks);
  const values: FormValues = {};
  for (const d of defs) {
    const v = rawValues[d.key];
    values[d.key] = v === null || v === undefined ? '' : String(v);
  }
  const cleared = clearMarked(defs, values, marks);
  const shape = Object.fromEntries(defs.map((d) => [d.key, fieldSchema(d)]));
  const r = z.object(shape).safeParse(cleared);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? 'Revisa los datos.');
  const main: Record<string, unknown> = {};
  const priv: Record<string, unknown> = {};
  const mm: Marks = {};
  const pm: Marks = {};
  for (const d of defs) {
    (d.private ? priv : main)[d.key] = (r.data as Record<string, unknown>)[d.key];
    if (marks[d.key]) (d.private ? pm : mm)[d.key] = marks[d.key];
  }
  return { main, priv, marks: { main: mm, priv: pm }, values: cleared };
}

// ---------------------------------------------------------------------------
// Writing a ficha (as the person: RLS and the triggers decide; the history writes itself).
// Column names come from the field definitions (constants), never from the input.
// ---------------------------------------------------------------------------
type FichaTable = 'obra_fichas' | 'community_reports';
const PRIVATE_OF: Record<FichaTable, string> = { obra_fichas: 'obra_ficha_private', community_reports: 'community_report_private' };
const COLUMN = /^[a-z][a-z0-9_]{0,59}$/;

function columns(row: Record<string, unknown>): string[] {
  const cols = Object.keys(row);
  for (const c of cols) if (!COLUMN.test(c)) throw new Error(`bad column ${c}`);
  return cols;
}

// Insert (id null) or update the main row. Returns null when RLS lets this person change nothing.
export async function writeFicha(
  sql: Sql,
  table: FichaTable,
  id: string | null,
  row: Record<string, unknown>,
  marks: Marks,
): Promise<{ id: string; code: string; rev: number } | null> {
  const cols = columns(row);
  const params = [...cols.map((c) => row[c]), JSON.stringify(marks)];
  if (!id) {
    return sql.one(
      `insert into public.${table} (${cols.join(', ')}, marks) values (${cols.map((_, n) => `$${n + 1}`).join(', ')}, $${cols.length + 1}::text::jsonb)
       returning id, code, rev`,
      params,
    );
  }
  return sql.one(
    `update public.${table} set ${cols.map((c, n) => `${c} = $${n + 1}`).join(', ')}, marks = $${cols.length + 1}::text::jsonb
      where id = $${cols.length + 2} and deleted_at is null returning id, code, rev`,
    [...params, id],
  );
}

// The contacts (private table): created only when something was written or marked, updated otherwise.
export async function writePrivate(sql: Sql, table: FichaTable, id: string, row: Record<string, unknown>, marks: Marks): Promise<void> {
  const priv = PRIVATE_OF[table];
  const cols = columns(row);
  const exists = await sql.one<{ id: string }>(`select id from public.${priv} where id = $1`, [id]);
  const any = Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== '') || Object.keys(marks).length > 0;
  if (!exists && !any) return;
  const params = [...cols.map((c) => row[c]), JSON.stringify(marks), id];
  const r = exists
    ? await sql.one(
        `update public.${priv} set ${cols.map((c, n) => `${c} = $${n + 1}`).join(', ')}, marks = $${cols.length + 1}::text::jsonb
          where id = $${cols.length + 2} returning id`,
        params,
      )
    : await sql.one(
        `insert into public.${priv} (${cols.join(', ')}, marks, id) values (${cols.map((_, n) => `$${n + 1}`).join(', ')}, $${cols.length + 1}::text::jsonb, $${cols.length + 2})
         returning id`,
        params,
      );
  if (!r) throw new UserError('No pudimos guardar los contactos: hace falta el doble factor.');
}
