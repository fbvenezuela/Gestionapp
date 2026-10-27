import { stripDateTime } from './text';

// Daily digest by email: what waits for each person, by role. Counts and titles ONLY — never
// an event's date, time or place (titles go through the same guard as pushes).

export type DigestData = {
  inReview: { title: string; red: boolean }[]; // pieces waiting for a decision
  tweetsToApprove: number;
  changesRequested: string[]; // piece titles
  tweetStock: { daysLeft: number; low: boolean } | null;
  eventsWithoutBrief: string[]; // event titles
};

export type DigestSection = { line: string; titles: string[]; more: number };
export type Digest = { subject: string; total: number; sections: DigestSection[] };

const MAX_TITLES = 5;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function cleanTitles(titles: string[]): { titles: string[]; more: number } {
  const clean = titles.map((t) => stripDateTime(t).slice(0, 90)).filter(Boolean);
  return { titles: clean.slice(0, MAX_TITLES), more: Math.max(0, titles.length - MAX_TITLES) };
}

export function buildDigest(roles: readonly string[], d: DigestData): Digest | null {
  const has = (...r: string[]) => r.some((x) => roles.includes(x));
  const sections: DigestSection[] = [];
  let total = 0;
  const list = (titles: string[], line: string) => {
    if (!titles.length) return;
    total += titles.length;
    sections.push({ line, ...cleanTitles(titles) });
  };

  // The boss approves everything: every piece in review (saying how many are red) and the tweets.
  if (has('boss')) {
    const red = d.inReview.filter((p) => p.red).length;
    const line = plural(d.inReview.length, 'pieza por aprobar', 'piezas por aprobar');
    list(d.inReview.map((p) => p.title), red ? `${line} (${red === 1 ? '1 en rojo' : `${red} en rojo`})` : line);
    if (d.tweetsToApprove > 0) {
      total += d.tweetsToApprove;
      sections.push({ line: plural(d.tweetsToApprove, 'tweet por aprobar', 'tweets por aprobar'), titles: [], more: 0 });
    }
  }
  if (has('social', 'admin')) {
    list(d.changesRequested, plural(d.changesRequested.length, 'pieza con cambios pedidos', 'piezas con cambios pedidos'));
    if (d.tweetStock?.low) {
      total += 1;
      sections.push({
        line: d.tweetStock.daysLeft > 0 ? `Quedan ${plural(d.tweetStock.daysLeft, 'día', 'días')} de tweets programados` : 'No quedan tweets programados',
        titles: [],
        more: 0,
      });
    }
  }
  if (has('dispatch')) {
    list(d.eventsWithoutBrief, plural(d.eventsWithoutBrief.length, 'evento con la ficha técnica incompleta', 'eventos con la ficha técnica incompleta'));
  }

  if (!sections.length) return null;
  return { subject: total === 1 ? 'Tu resumen: 1 cosa espera por ti' : `Tu resumen: ${total} cosas esperan por ti`, total, sections };
}

// Plain text of a digest (used by tests and as a quick preview).
export function digestText(dg: Digest): string {
  return [dg.subject, ...dg.sections.flatMap((s) => [s.line, ...s.titles.map((t) => `- ${t}`), ...(s.more ? [`y ${s.more} más`] : [])])].join('\n');
}
