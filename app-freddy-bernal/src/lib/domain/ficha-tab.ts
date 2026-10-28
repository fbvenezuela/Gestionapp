import { REPORTER_ATTENDS, type Mark } from '../data/ficha-labels';
import { FIELDS, GROUPS, isEmpty, type FichaKind, type FieldDef } from './ficha-fields';
import { withoutPhones } from './phones';

// The ficha inside the event it was born from (cambios del 27/10/2026, §4.1): the «Ficha de obra» / «Reporte» tab,
// the boss's «Antes de hablar» and «Lo que voy a decir» in modo lectura. Pure, so it can be tested.
//
// Who reads what is the database's (RLS): Redes and Grabación read an obra's MAIN part only while its visit is live
// (obra_fichas_select), never obra_ficha_private and never a community report. Even so, for them this takes only
// what says what the obra is: no contact (the private part is not even passed in), no people's names besides the
// engineer's (a public official, as in the event's brief: ficha-event.ts), no days of the obra's own calendar
// (start, delivery, follow-up), and anything that looks like a phone number in free text is taken out. The boss,
// despacho and administración (2FA) get the private part too, in its own box.

export type TabItem = { def: FieldDef; value: unknown; mark?: Mark };
export type TabGroup = { key: string; title: string; items: TabItem[] };
export type FichaTab = { groups: TabGroup[]; contacts: TabItem[] };

// Left out for whoever does not read the contacts: people's names and the obra's (or report's) own days.
export const HIDDEN_WITHOUT_CONTACTS: Record<FichaKind, readonly string[]> = {
  obra: ['started_on', 'due_on', 'follow_up_owner', 'follow_up_due'],
  report: ['reported_at', 'in_charge', 'follow_up_owner', 'follow_up_due'],
};

const marksOf = (row: Record<string, unknown> | null | undefined): Record<string, unknown> =>
  row && row.marks && typeof row.marks === 'object' ? (row.marks as Record<string, unknown>) : {};

// Answered fields only: a value, or «Por confirmar» (worth saying); «No aplica» and empty ones are left out.
function itemOf(def: FieldDef, value: unknown, marks: Record<string, unknown>, scrub: boolean): TabItem | null {
  const mark = marks[def.key];
  if (mark === 'to_confirm') return { def, value: null, mark: 'to_confirm' };
  if (mark === 'not_applicable' || isEmpty(value)) return null;
  if (!scrub || typeof value !== 'string') return { def, value };
  const clean = withoutPhones(value);
  return clean ? { def, value: clean } : null;
}

/**
 * The tab of an event born from a ficha. `row`: the main table's row as this person reads it. `priv`: its private
 * part, or null. `contacts`: whether this person reads the contacts (boss, despacho, administración); without it the
 * private part is ignored even if passed, and names, the ficha's own days and phone-like text are left out.
 */
export function fichaTab(kind: FichaKind, row: Record<string, unknown>, priv: Record<string, unknown> | null, opts: { contacts: boolean }): FichaTab {
  const hidden = opts.contacts ? [] : HIDDEN_WITHOUT_CONTACTS[kind];
  const mainMarks = marksOf(row);
  const groups = GROUPS[kind]
    .map((g) => ({
      key: g.key,
      title: g.title,
      items: FIELDS[kind]
        .filter((d) => d.group === g.key && !d.private && !hidden.includes(d.key))
        .map((d) => itemOf(d, row[d.key], mainMarks, !opts.contacts))
        .filter((x): x is TabItem => !!x),
    }))
    .filter((g) => g.items.length);
  const contacts =
    opts.contacts && priv
      ? FIELDS[kind]
          .filter((d) => d.private)
          .map((d) => itemOf(d, priv[d.key], marksOf(priv), false))
          .filter((x): x is TabItem => !!x)
      : [];
  return { groups, contacts };
}

export type BeforeItem = { label: string; value: string };

/**
 * «Antes de hablar» in the boss's modo lectura: who reported it and who is the liaison, from the private part, ONLY
 * when the database returned it (null for everyone else: nothing to show). Never a phone: the iPad's screen can be
 * on camera.
 */
export function beforeSpeaking(kind: FichaKind, priv: Record<string, unknown> | null): BeforeItem[] {
  if (!priv) return [];
  const marks = marksOf(priv);
  const text = (k: string): string => {
    if (marks[k] === 'to_confirm') return 'Por confirmar';
    if (marks[k] === 'not_applicable') return '';
    const v = priv[k];
    return typeof v === 'string' ? withoutPhones(v) : '';
  };
  const out: BeforeItem[] = [];
  const add = (label: string, value: string) => {
    if (value.trim()) out.push({ label, value: value.trim() });
  };
  if (kind === 'obra') {
    add('Quién hizo el reporte', text('reporter_name'));
    const attends = marks.reporter_attends === 'not_applicable' ? '' : String(priv.reporter_attends ?? '');
    add('¿Estará en la visita?', REPORTER_ATTENDS[attends as keyof typeof REPORTER_ATTENDS] ?? '');
    add('Si no asiste, quién la representa', text('representative'));
    add('Enlace comunitario', text('liaison_name'));
    add('Qué debe saber o decidir', text('boss_should_know'));
  } else {
    add('Quién reportó', [text('reporter_name'), text('reporter_role')].filter(Boolean).join(', '));
  }
  return out;
}

/**
 * What modo lectura shows: the storyboard's «Lo que va a decir» and the blocks' lines. With no speech written, the
 * ficha's «Lo que voy a decir» (the FAB dialog) instead, one paragraph per part.
 */
export function readingParts(speech: string | null | undefined, lines: readonly string[], fab: string | null | undefined): { parts: string[]; fromFicha: boolean } {
  const own = (speech ?? '').trim();
  const fromFab = own ? [] : (fab ?? '').split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
  return {
    parts: [...(own ? [own] : fromFab), ...lines.map((t) => t.trim()).filter(Boolean)],
    fromFicha: !own && fromFab.length > 0,
  };
}
