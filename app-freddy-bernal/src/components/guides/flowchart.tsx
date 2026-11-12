import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { Role, TeamRole } from '@/lib/roles';
import { canOpen, screenFor } from '@/lib/assistant/screens';
import type { Flow, FlowStep } from '@/lib/guides/types';
import { SEE_FLOW, flowById, jumpWords } from '@/lib/guides/flows';
import { cn } from '@/lib/cn';
import { Card, CardBody } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';

// A flow between roles as the app shows it (R3, D-44, map_ui §8): an ordered list of cards, one column at every width,
// with decorative arrows (SVG, aria-hidden) between them. A decision keeps its question and its ways out inside the
// card, as a list («Sí → …»), never only in an arrow, and says where it goes (« Vuelve al paso 3.», « Sigue en el paso 5.»).
// The reader's own steps get an accent border and «tú». A step links to its screen only when the reader can open it,
// and to the flow it goes on in («Sigue en el flujo El semáforo»). Screen readers hear «lista, N elementos: Paso 1 …».
// Colors only through tokens and currentColor (no-hardcoded-colors.test.ts); no ::before over the text.

// The short names the guides use («Despacho», not «Director de despacho»).
export const ROLE_SHORT: Record<TeamRole, string> = {
  boss: 'Jefe',
  dispatch: 'Despacho',
  politics: 'Política',
  ivt: 'IVT',
  camera: 'Grabación',
  social: 'Redes',
};

/** «Jefe o Despacho» (who does a step) or, with 'y', «Jefe, Despacho y Redes» (who a flow involves). */
export function whoDoes(roles: readonly TeamRole[], and: 'o' | 'y' = 'o'): string {
  const names = roles.map((r) => ROLE_SHORT[r]);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}

function Arrow() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 24 32" className="lucide mx-auto h-8 w-6 shrink-0 text-muted">
      <path d="M12 2v24M6 20l6 6 6-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Step({ step, n, flow, mine, roles }: { step: FlowStep; n: number; flow: Flow; mine: readonly TeamRole[]; roles: readonly Role[] }) {
  const yours = step.roles.some((r) => mine.includes(r));
  const open = step.href && canOpen(step.href, [...roles]) ? screenFor(step.href) : null;
  const stepNo = (id: string) => flow.steps.findIndex((s) => s.id === id) + 1;
  const see = step.see ? flowById(step.see) : null;
  return (
    <Card className={cn(yours && 'border-2 border-accent')}>
      <CardBody className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="label-caps">Paso {n}</span>
          <Chip tone={yours ? 'accent' : 'neutral'}>
            {whoDoes(step.roles)}
            {yours ? ' · tú' : null}
          </Chip>
          {yours ? <span className="sr-only">Te toca a ti.</span> : null}
        </div>
        <p className="text-[15px]">{step.text}</p>
        {step.question ? (
          <div className="flex flex-col gap-1.5">
            <p className="text-[15px] font-semibold">{step.question}</p>
            <ul className="flex flex-col gap-1.5" aria-label={`Respuestas a: ${step.question}`}>
              {(step.branches ?? []).map((b) => {
                const to = b.to ? stepNo(b.to) : 0;
                return (
                  <li key={b.label} className="rounded-[var(--radius-control)] bg-surface-2 px-3 py-2 text-[15px]">
                    <b>{b.label}</b>
                    <span aria-hidden="true"> → </span>
                    <span className="sr-only">: </span>
                    {b.text}
                    {jumpWords(to, n) ? <span className="text-text-2">{jumpWords(to, n)}</span> : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
        {see ? (
          <Link href={`/ayuda/flujos?f=${see.id}`} className="inline-flex min-h-11 w-fit items-center gap-1 rounded-[var(--radius-control)] text-[15px] font-semibold text-accent-ink hover:underline">
            {SEE_FLOW} «{see.title}»
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
        {open ? (
          <Link href={step.href!} className="inline-flex min-h-11 w-fit items-center gap-1 rounded-[var(--radius-control)] text-[15px] font-semibold text-accent-ink hover:underline">
            Abrir {open.label}
            <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </CardBody>
    </Card>
  );
}

/** The flow, one card per step. `mine`: the reader's team roles (their steps say «tú»); `roles`: what they can open. */
export function Flowchart({ flow, mine, roles }: { flow: Flow; mine: readonly TeamRole[]; roles: readonly Role[] }) {
  const n = flow.steps.length;
  return (
    <ol aria-label={`${flow.title}, ${n} pasos`} className="flex flex-col">
      {flow.steps.map((s, i) => (
        <li key={s.id} className="flex flex-col">
          <Step step={s} n={i + 1} flow={flow} mine={mine} roles={roles} />
          {i < n - 1 ? <Arrow /> : null}
        </li>
      ))}
    </ol>
  );
}
