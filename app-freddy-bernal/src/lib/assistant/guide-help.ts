// «¿Cómo hago X?» with the person's role guide (R3, D-42): the «Paso a paso» tasks of src/lib/guides, one source with
// /ayuda (they never drift from the app). Pure: the demo brain uses it when a task's title says exactly what is asked
// and no ficha's title says it as well («¿cómo cargo una ficha comunitaria?» → «Cargar una ficha comunitaria»).
import { TEAM_ROLES, type Role, type TeamRole } from '../roles';
import { guideFor } from '../guides';
import { GUIDE_SLUGS } from '../guides/slugs';
import { canon, hasWord, keyWords } from './brain';

export type GuideTask = { role: TeamRole; id: string; title: string; steps: string[]; tour?: string; guide: string };

/** The tasks of these roles' guides, in the team's order (a person with two roles gets both). */
export function roleTasks(roles: readonly Role[]): GuideTask[] {
  return TEAM_ROLES.filter((r) => roles.includes(r)).flatMap((role) =>
    guideFor(role).tasks.map((t) => ({ role, id: t.id, title: t.title, steps: t.steps, ...(t.tour ? { tour: t.tour } : {}), guide: `/ayuda/${GUIDE_SLUGS[role]}?ver=pasos` })),
  );
}

/** How much of what is asked (its words that say something, 2 or more) a text says: 0 to 1. */
export function coverOf(text: string, asked: string[]): number {
  if (!asked.length) return 0;
  const t = ` ${canon(text)}`;
  return asked.filter((w) => hasWord(t, w)).length / asked.length;
}

/** The task whose title says all that is asked (two words or more), if any: the first of the person's guides. */
export function taskFor(question: string, roles: readonly Role[]): GuideTask | null {
  const asked = [...new Set(keyWords(question))];
  if (asked.length < 2) return null;
  return roleTasks(roles).find((t) => coverOf(t.title, asked) === 1) ?? null;
}

/** «Cargar una ficha comunitaria, paso a paso: 1) … 2) … 3) …», up to about 420 letters; the rest is in the guide. */
export function taskAnswer(t: GuideTask): string {
  const out: string[] = [];
  let len = t.title.length + 16;
  for (const [k, s] of t.steps.entries()) {
    const line = `${k + 1}) ${s}`;
    if (out.length && len + line.length > 420) break;
    out.push(line);
    len += line.length + 1;
  }
  const rest = out.length < t.steps.length ? ' El resto está en la guía de tu trabajo.' : '';
  return `${t.title}, paso a paso: ${out.join(' ')}${rest}`;
}
