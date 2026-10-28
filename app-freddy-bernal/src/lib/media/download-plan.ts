// «Descargar todo» of a pauta (cambios del 27/10/2026, §5): what goes where, before a single byte moves. Pure (no
// browser, no server), so the names and the LEEME can be tested.
//
// Rule 4, for every role and the boss too: no file name, folder or LEEME line carries the event's date, time,
// address or contacts. The plan never receives them (its input has no field for them) and every name is made only
// of fixed words, the event code (E-0042, a sequence) and the label the platform wrote («Jefe hablando 2»), with
// anything that still looks like a date or a time taken out. What Grabación typed (the note, the storyboard text) is
// copied as written: Redes already reads it on screen, and editors write timecodes like 2:15.
//
//   E-0042/
//     E-0042-LEEME.txt                      the title, the notes of Grabación and the list of files
//     Storyboard/E-0042-Storyboard-1.jpg
//     Jefe-hablando/E-0042-Jefe-hablando-1.mp4
//     ...

import { MEDIA_KIND } from '@/lib/data/labels';
import { GROUP_CODE, mediaFileName, slug } from '@/lib/storage/drive/names';
import { stripDateTime } from '@/lib/push/text';
import { sizeText } from './chunk-download';

export type PlanFile = { id: string; kind: string; label: string; ext: string; size: number; drive: boolean };
export type PlanNote = { kind: 'editor_note' | 'storyboard_text'; body: string; author: string };
export type PlanInput = {
  title: string;
  code: string;
  files: readonly PlanFile[];
  // Grabación's notes; null = this person does not read them (despacho): the LEEME then says nothing about notes.
  notes?: readonly PlanNote[] | null;
  // Only these kinds (the checkboxes of the dialog); null or missing = all.
  kinds?: readonly string[] | null;
};
export type PlanEntry = PlanFile & { folder: string; name: string; path: string };
export type PlanTotals = { files: number; bytes: number; driveBytes: number; otherBytes: number };
export type DownloadPlan = {
  root: string;
  readme: { name: string; path: string; text: string };
  entries: PlanEntry[];
  totals: PlanTotals;
};

// The order of the folders and of the LEEME: what Grabación used, then what it recorded, then the rest.
export const KIND_ORDER = [
  'storyboard', 'boss', 'drone', 'broll', 'other', 'final', 'cover', 'editable', 'voice_line', 'evidence', 'tweet_image',
  'before', 'progress', 'after', 'document',
] as const;

const rank = (kind: string) => {
  const i = (KIND_ORDER as readonly string[]).indexOf(kind);
  return i < 0 ? KIND_ORDER.length : i;
};

/** The kinds present in `files`, in folder order. */
export function kindsOf(files: readonly PlanFile[]): string[] {
  return [...new Set(files.map((f) => f.kind))].sort((a, b) => rank(a) - rank(b));
}

/** A label with nothing that looks like a date or a time; the kind's name when nothing is left. */
function cleanLabel(label: string, kind: string): string {
  return stripDateTime(label ?? '').trim() || MEDIA_KIND[kind] || 'Archivo';
}

/** The event code only when it looks like one (E-0042): never free text in a folder name. */
function rootOf(code: string): string {
  return GROUP_CODE.test(code ?? '') ? code : 'Material';
}

// «E-0042-Jefe-hablando-1.mp4» taken → «E-0042-Jefe-hablando-1-2.mp4».
function unique(name: string, used: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let out = name;
  for (let n = 2; used.has(out.toLowerCase()); n++) out = `${base}-${n}${ext}`;
  used.add(out.toLowerCase());
  return out;
}

const NOTE_TITLE: Record<PlanNote['kind'], string> = {
  editor_note: 'NOTA DE GRABACIÓN PARA EL EDITOR',
  storyboard_text: 'STORYBOARD CON EL QUE SE GRABÓ (ESCRITO)',
};

/** The text of the LEEME: title, Grabación's notes and the list of files. Never a date, time or address. */
export function readmeText(title: string, code: string, notes: readonly PlanNote[] | null, entries: readonly PlanEntry[]): string {
  const t = stripDateTime(title ?? '').trim();
  const lines: string[] = [[GROUP_CODE.test(code ?? '') ? code : '', t].filter(Boolean).join(' · ') || 'Material de la pauta', ''];
  lines.push('El material de esta pauta, bajado de la plataforma. Los nombres de los archivos no llevan fecha, hora ni lugar.', '');
  for (const kind of notes ? (['editor_note', 'storyboard_text'] as const) : []) {
    const list = (notes ?? []).filter((n) => n.kind === kind && n.body.trim());
    lines.push(NOTE_TITLE[kind]);
    if (!list.length) lines.push(kind === 'editor_note' ? 'Grabación no dejó nota.' : 'Grabación no escribió storyboard.');
    for (const n of list) lines.push(`${n.author ? `${n.author}: ` : ''}${n.body.trim()}`);
    lines.push('');
  }
  lines.push(`ARCHIVOS (${entries.length})`);
  for (const e of entries) lines.push(`${e.folder}/${e.name} · ${sizeText(e.size)}`);
  if (!entries.length) lines.push('Ninguno.');
  return `${lines.join('\n')}\n`;
}

export function buildDownloadPlan(input: PlanInput): DownloadPlan {
  const root = rootOf(input.code);
  const code = root === 'Material' ? null : root;
  const want = input.kinds ? new Set(input.kinds) : null;
  const files = input.files
    .filter((f) => !want || want.has(f.kind))
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f.kind) - rank(b.f.kind) || a.i - b.i)
    .map(({ f }) => f);
  const readmeName = `${code ?? 'Material'}-LEEME.txt`;
  const used = new Set<string>([readmeName.toLowerCase()]);
  const entries: PlanEntry[] = files.map((f) => {
    const folder = slug(MEDIA_KIND[f.kind] ?? 'Otros') || 'Otros';
    const name = unique(mediaFileName(code, cleanLabel(f.label, f.kind), f.ext), used);
    return { ...f, size: Math.max(0, Number(f.size) || 0), folder, name, path: `${root}/${folder}/${name}` };
  });
  const totals = entries.reduce<PlanTotals>(
    (t, e) => ({
      files: t.files + 1,
      bytes: t.bytes + e.size,
      driveBytes: t.driveBytes + (e.drive ? e.size : 0),
      otherBytes: t.otherBytes + (e.drive ? 0 : e.size),
    }),
    { files: 0, bytes: 0, driveBytes: 0, otherBytes: 0 },
  );
  return {
    root,
    readme: { name: readmeName, path: `${root}/${readmeName}`, text: readmeText(input.title, root, input.notes === undefined ? [] : input.notes, entries) },
    entries,
    totals,
  };
}

// ---------------------------------------------------------------------------
// The Drive transfer cap (docs/DRIVE.md): files kept in Drive pass through the platform and count against this
// month's cap and the person's share for today. Files elsewhere download straight from storage and do not count.
// ---------------------------------------------------------------------------
export type DriveBudget = { monthLeft: number | null; todayLeft: number | null };
export type BudgetVerdict = { ok: true } | { ok: false; why: 'today' | 'month'; left: number; need: number };

/** Whether the Drive part of the plan fits in what is left (null budget or null parts = no cap). */
export function budgetVerdict(totals: Pick<PlanTotals, 'driveBytes'>, budget: DriveBudget | null): BudgetVerdict {
  const need = totals.driveBytes;
  if (!budget || need <= 0) return { ok: true };
  if (budget.monthLeft != null && need > budget.monthLeft) return { ok: false, why: 'month', left: Math.max(0, budget.monthLeft), need };
  if (budget.todayLeft != null && need > budget.todayLeft) return { ok: false, why: 'today', left: Math.max(0, budget.todayLeft), need };
  return { ok: true };
}

/** What the person reads before starting, when the Drive part does not fit. */
export function budgetMessage(v: BudgetVerdict): string | null {
  if (v.ok) return null;
  const left = v.left > 0 ? sizeText(v.left) : 'nada';
  return v.why === 'today'
    ? `De Drive esto pesa ${sizeText(v.need)} y hoy te queda ${left} de tu cupo. Elige qué bajar hoy, o baja lo que alcance y sigue mañana con la misma carpeta.`
    : `De Drive esto pesa ${sizeText(v.need)} y este mes queda ${left} para todo el equipo. Elige qué bajar o avísale a Administración.`;
}
