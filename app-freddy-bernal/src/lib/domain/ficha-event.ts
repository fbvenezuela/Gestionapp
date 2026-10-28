import { MAX_TITLE } from './event-title';
import { withoutPhones } from './phones';

// «Ponerle fecha» (§4.1, §4.2): what the new event takes from its ficha. The event and its brief are read by Redes
// and Grabación, so they take ONLY main-table fields, and never a contact: no phone, no reporter's name, no
// liaison, nothing from the private tables (they are not even read here). The engineer's name goes in (a public
// official, main table); a report's «encargado» does not (Redes never reads a report). Anything that looks like a
// phone number in free text is taken out. No dates either (the obra's start and delivery days stay in the ficha;
// the visit's date is the schedule's). Pure, so it can be tested.

export type EventDraft = {
  title: string;
  placeName: string;
  summary: string;
  brief: { summary: string; work_description: string; led_by: string; in_charge: string; achievements: string; key_facts: string; protocol: string; notes: string };
};

// Anything that looks like a phone number in free text is taken out: one detector for the whole app (phones.ts).
export { withoutPhones };

const str = (row: Record<string, unknown>, k: string) => (typeof row[k] === 'string' ? withoutPhones(row[k] as string) : '');
const num = (row: Record<string, unknown>, k: string) => {
  const v = row[k];
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const fmt = (n: number) => Math.trunc(n).toLocaleString('es-VE');
const clip = (s: string, max: number) => (s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`);
const lines = (...xs: (string | false | null | undefined)[]) => xs.filter((x): x is string => !!x && !!x.trim()).join('\n');

export function obraVisitTitle(name: string): string {
  return clip(`Visita de obra: ${withoutPhones(name)}`, MAX_TITLE);
}

const WORK_STATE_SAID: Record<string, string> = {
  not_started: 'sin empezar', in_progress: 'en ejecución', stalled: 'paralizada', finished: 'terminada',
};

// From an obra ficha (main table only).
export function eventFromObra(row: Record<string, unknown>): EventDraft {
  const src = '(Ficha del IVT)';
  const people = num(row, 'people_count');
  const families = num(row, 'families_count');
  const pct = num(row, 'progress_pct');
  const state = typeof row.work_state === 'string' ? WORK_STATE_SAID[row.work_state] : undefined;
  const investment = str(row, 'investment');
  const currency = typeof row.currency === 'string' && row.currency !== 'other' ? row.currency : '';
  const funding = str(row, 'funding_source');
  const summary = clip(str(row, 'problem'), 1000);
  return {
    title: obraVisitTitle(String(row.name ?? '')),
    placeName: clip([str(row, 'sector'), str(row, 'parish')].filter(Boolean).join(', '), 200),
    summary,
    brief: {
      summary,
      work_description: str(row, 'works'),
      led_by: str(row, 'executor'),
      in_charge: str(row, 'engineer_name'),
      achievements: lines(
        state || pct !== null ? `Obra ${[state, pct !== null ? `${pct} % de avance` : ''].filter(Boolean).join(', con ')}.` : '',
        str(row, 'benefits'),
      ),
      key_facts: lines(
        people !== null && `${fmt(people)} personas beneficiadas ${src}`,
        families !== null && `${fmt(families)} familias beneficiadas ${src}`,
        pct !== null && `${pct} % de avance ${src}`,
        investment && `Inversión: ${investment}${currency ? ` ${currency}` : ''}${funding ? `, ${funding}` : ''} ${src}`,
      ),
      protocol: '',
      notes: lines(
        str(row, 'problem_since') && `El problema existe desde ${str(row, 'problem_since')}.`,
        str(row, 'why_decided') && `Por qué se hizo: ${str(row, 'why_decided')}`,
        str(row, 'communities') && `Comunidades: ${str(row, 'communities')}`,
        str(row, 'next_action') && `Próxima acción: ${str(row, 'next_action')}`,
      ),
    },
  };
}

// From a community report (main table only; never its «encargado», its contacts or its address).
export function eventFromReport(row: Record<string, unknown>): EventDraft {
  const estimated = row.figures_kind === 'estimated';
  const src = estimated ? '(Reporte comunitario, cifra estimada)' : '(Reporte comunitario)';
  const people = num(row, 'people_count');
  const families = num(row, 'families_count');
  const summary = clip(str(row, 'description'), 1000);
  return {
    title: clip(withoutPhones(String(row.title ?? '')), MAX_TITLE),
    placeName: clip(str(row, 'community'), 200),
    summary,
    brief: {
      summary,
      work_description: str(row, 'description'),
      led_by: str(row, 'institution'),
      in_charge: '',
      achievements: str(row, 'results'),
      key_facts: lines(
        people !== null && `${fmt(people)} personas ${src}`,
        families !== null && `${fmt(families)} familias ${src}`,
      ),
      protocol: '',
      notes: lines(str(row, 'why_matters') && `Por qué importa: ${str(row, 'why_matters')}`, str(row, 'sectors') && `Sectores: ${str(row, 'sectors')}`),
    },
  };
}
