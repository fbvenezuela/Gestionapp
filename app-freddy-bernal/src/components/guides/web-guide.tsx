import Link from 'next/link';
import { ChevronRight, Workflow } from 'lucide-react';
import type { WebBlock, WebFlow, WebPage, WebSection } from '@/lib/guides/types';
import {
  GUIA_WEB,
  WEB_GUIDE_ROWS,
  WEB_PAGE_HREF,
  fillClientWords,
  pdfNumber,
  pdfText,
  webDocOf,
  webEntry,
  webHref,
  webPart,
  webPartsOf,
  type ClientWords,
  type WebPartView,
} from '@/lib/guides/web';
import { cn } from '@/lib/cn';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { PageHeader } from '@/components/ui/page';

// The web's and Atención's guide in «Ayuda y guías» (WF-C): /ayuda/web and /ayuda/atencion, for the boss and
// Administración. The same text as the docs and the PDF «Guía de la web y sus flujos», word for word, with the client's
// words filled from its config and the sections numbered as the PDF numbers them: the index lists each part as a card,
// ?parte=N shows one part with an anchor per section (its id), ?flujo=<id> one flow as a list of steps with links between
// them. Server components only: plain links, no state.

export const WEB_PAGE_TITLE: Record<WebPage, string> = Object.fromEntries(WEB_GUIDE_ROWS.map((r) => [r.page, r.label])) as Record<WebPage, string>;
const PAGE_SUBTITLE: Record<WebPage, string> = {
  web: 'Qué tiene la web del gobernador, quién hace qué, cómo se escribe y se publica, y la versión de prueba.',
  atencion: 'Cómo se atiende en el panel lo que la gente manda desde la web, paso a paso.',
};
const HOW_TO_READ_WEB = 'Lo que va entre comillas, «así», es el texto exacto de la pantalla. Los números de cada parte son los de la guía en PDF.';

// **bold**, `code` and a reference «[§id]»: a link to that section, with its number.
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[§[a-z0-9-]+\])/;

function Inline({ text, words }: { text: string; words: ClientWords }) {
  const parts = text.split(INLINE).filter((p) => p !== '');
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
          return (
            <strong key={i} className="font-semibold">
              <Inline text={p.slice(2, -2)} words={words} />
            </strong>
          );
        }
        if (p.startsWith('`') && p.endsWith('`') && p.length > 2) {
          return (
            <code key={i} className="rounded bg-surface-2 px-1 font-mono text-[0.92em]">
              {p.slice(1, -1)}
            </code>
          );
        }
        const ref = /^\[§([a-z0-9-]+)\]$/.exec(p);
        if (ref) {
          const x = webEntry(ref[1]);
          const href = x ? webHref(x.id) : null;
          if (!x || !href) return null;
          return (
            <Link key={i} href={href} className="font-semibold text-accent-ink underline underline-offset-2" aria-label={`${x.pdf} ${fillClientWords(x.title, words)}`}>
              {x.pdf}
            </Link>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function Block({ b, text }: { b: WebBlock; text: (t: string) => React.ReactNode }) {
  switch (b.kind) {
    case 'p':
      return <p className="text-[15px]">{text(b.text)}</p>;
    case 'list':
      return (
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px]">
          {b.items.map((t, i) => (
            <li key={i}>{text(t)}</li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="flex list-decimal flex-col gap-1.5 pl-5 text-[15px]">
          {b.items.map((t, i) => (
            <li key={i}>{text(t)}</li>
          ))}
        </ol>
      );
    case 'note':
      return (
        <div className="flex flex-col gap-2 rounded-[var(--radius-control)] border-l-4 border-accent bg-surface-2 px-3 py-2.5 text-[15px]">
          {b.paras.map((t, i) => (
            <p key={i}>{text(t)}</p>
          ))}
        </div>
      );
    case 'table':
      // One card per row, the first cell on top and each other cell under its column's name: a table of three or four
      // columns does not fit a 360 px screen, and a list reads the same with a screen reader.
      return (
        <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-control)] border border-border text-[15px]">
          {b.rows.map((r, i) => (
            <li key={i} className="flex flex-col gap-1.5 px-3 py-2.5">
              <p className="font-semibold">
                <span className="sr-only">{text(b.head[0])}: </span>
                {text(r[0])}
              </p>
              {r.length > 1 ? (
                <dl className="flex flex-col gap-1.5">
                  {r.slice(1).map((c, j) => (
                    <div key={j}>
                      <dt className="label-caps">{text(b.head[j + 1])}</dt>
                      <dd>{text(c)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ul>
      );
  }
}

/** The text of a section's doc as «Ayuda y guías» shows it: the PDF's references and the client's words. */
function textOf(s: WebSection, words: ClientWords) {
  const doc = webDocOf(s.id);
  return function SectionText(t: string) {
    return <Inline text={fillClientWords(pdfText(doc, t), words)} words={words} />;
  };
}

function SectionCard({ s, words, heading }: { s: WebSection; words: ClientWords; heading: boolean }) {
  const text = textOf(s, words);
  const [, m] = pdfNumber(s.pdf);
  return (
    <Card solid id={s.id} className="scroll-mt-20">
      {heading ? <CardHeader title={m === 0 ? fillClientWords(s.title, words) : `${s.pdf} ${fillClientWords(s.title, words)}`} /> : null}
      <CardBody className="flex flex-col gap-3">
        {s.blocks.map((b, i) => (
          <Block key={i} b={b} text={text} />
        ))}
      </CardBody>
    </Card>
  );
}

function Row({ href, label, detail, icon }: { href: string; label: string; detail?: string; icon?: boolean }) {
  return (
    <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2 sm:px-5">
      {icon ? <Workflow className="h-5 w-5 shrink-0 text-text-2" aria-hidden /> : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold [overflow-wrap:anywhere]">{label}</span>
        {detail ? <span className="text-sm text-text-2">{detail}</span> : null}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
    </Link>
  );
}

const opening = (s: WebSection) => pdfNumber(s.pdf)[1] === 0;
const partHref = (page: WebPage, n: number) => `${WEB_PAGE_HREF[page]}?parte=${n}`;

/** The page's index: its opening and each part as a card with its sections and flows. */
export function WebGuideIndex({ page, words }: { page: WebPage; words: ClientWords }) {
  const parts = webPartsOf(page);
  const journey = webPart(2, 'web');
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader
        title={WEB_PAGE_TITLE[page]}
        subtitle={
          <>
            {PAGE_SUBTITLE[page]}
            <span className="mt-1 block text-sm">{HOW_TO_READ_WEB}</span>
          </>
        }
        back={{ href: '/ayuda', label: 'Ayuda y guías' }}
      />
      {page === 'web' ? <SectionCard s={GUIA_WEB.sections[0]} words={words} heading={false} /> : null}
      {parts.map((v) => (
        <Card solid key={v.part.n} id={`parte-${v.part.n}`}>
          <CardHeader title={`Parte ${v.part.n} · ${v.part.title}`} subtitle={v.part.lede} />
          <ul className="divide-y divide-border">
            <li>
              <Row href={partHref(page, v.part.n)} label="Leer la parte completa" />
            </li>
            {v.sections
              .filter((s) => !opening(s))
              .map((s) => (
                <li key={s.id}>
                  <Row href={webHref(s.id)!} label={`${s.pdf} ${fillClientWords(s.title, words)}`} />
                </li>
              ))}
            {v.flows.map((f) => (
              <li key={f.id}>
                <Row href={webHref(f.id)!} label={`${f.pdf} ${fillClientWords(f.title, words)}`} detail={fillClientWords(f.who, words)} icon />
              </li>
            ))}
          </ul>
        </Card>
      ))}
      {page === 'atencion' && journey ? (
        <Card solid>
          <CardHeader title={`Parte 2 · ${journey.part.title}`} subtitle={`${journey.part.lede} Está en «${WEB_PAGE_TITLE.web}».`} />
          <ul>
            <li>
              <Row href={partHref('web', 2)} label="Leer la parte completa" />
            </li>
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

/** One part: its opening and every section, each with its anchor; the part's flows as links. */
export function WebGuidePart({ page, view, words }: { page: WebPage; view: WebPartView; words: ClientWords }) {
  const { part, sections, flows } = view;
  const parts = webPartsOf(page);
  const at = parts.findIndex((p) => p.part.n === part.n);
  const prev = parts[at - 1];
  const next = parts[at + 1];
  const rest = sections.filter((s) => !opening(s));
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <PageHeader title={`Parte ${part.n} · ${part.title}`} subtitle={part.lede} back={{ href: WEB_PAGE_HREF[page], label: WEB_PAGE_TITLE[page] }} />
      {rest.length || flows.length ? (
        <nav aria-label={`En la parte ${part.n}`}>
          <Card solid>
            <ul className="divide-y divide-border">
              {rest.map((s) => (
                <li key={s.id}>
                  <Row href={`#${s.id}`} label={`${s.pdf} ${fillClientWords(s.title, words)}`} />
                </li>
              ))}
              {flows.map((f) => (
                <li key={f.id}>
                  <Row href={webHref(f.id)!} label={`${f.pdf} ${fillClientWords(f.title, words)}`} detail={fillClientWords(f.who, words)} icon />
                </li>
              ))}
            </ul>
          </Card>
        </nav>
      ) : null}
      {sections.filter(opening).map((s) => (
        <SectionCard key={s.id} s={s} words={words} heading={fillClientWords(s.title, words) !== part.title} />
      ))}
      {rest.map((s) => (
        <SectionCard key={s.id} s={s} words={words} heading />
      ))}
      {prev || next ? (
        <nav aria-label="Otras partes" className="flex flex-wrap justify-between gap-2">
          {prev ? (
            <Link href={partHref(page, prev.part.n)} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-accent-ink hover:underline">
              Parte {prev.part.n} · {prev.part.title}
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={partHref(page, next.part.n)} className="inline-flex min-h-11 items-center gap-1 text-[15px] font-semibold text-accent-ink hover:underline">
              Parte {next.part.n} · {next.part.title}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}

/** One flow: each node a step, in the drawing's order, with links to the steps it leads to; then what to know. */
export function WebGuideFlow({ page, flow, words }: { page: WebPage; flow: WebFlow; words: ClientWords }) {
  const fill = (t: string) => fillClientWords(t, words);
  const number = new Map(flow.nodes.map((x, i) => [x.id, i + 1]));
  const anchor = (node: string) => `${flow.id}-${node}`;
  const title = fill(flow.title);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title={title} subtitle={`${flow.pdf} · ${fill(flow.who)}`} back={{ href: partHref(page, 6), label: 'Los flujos' }} />
      <ol aria-label={`${title}, ${flow.nodes.length} pasos`} className="flex flex-col gap-3">
        {flow.nodes.map((x, i) => {
          const out = flow.edges.filter((e) => e.from === x.id);
          const decision = x.shape === 'decision';
          return (
            <li key={x.id} id={anchor(x.id)} className="scroll-mt-20">
              <Card className={cn(decision && 'border-2 border-accent')}>
                <CardBody className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="label-caps">Paso {i + 1}</span>
                    {decision ? <Chip tone="accent">Pregunta</Chip> : null}
                  </div>
                  <p className={cn('text-[15px]', decision && 'font-semibold')}>
                    <Inline text={fill(x.text)} words={words} />
                  </p>
                  {out.length ? (
                    <ul className="flex flex-col gap-1.5" aria-label={`Después del paso ${i + 1}`}>
                      {out.map((e, j) => (
                        <li key={j}>
                          <Link href={`#${anchor(e.to)}`} className="inline-flex min-h-11 items-center gap-1 rounded-[var(--radius-control)] bg-surface-2 px-3 py-1.5 text-[15px] hover:underline">
                            {e.label ? (
                              <>
                                <b className="font-semibold">{fill(e.label)}</b>
                                <span aria-hidden="true"> → </span>
                                <span className="sr-only">: </span>
                              </>
                            ) : (
                              <span>Sigue en el </span>
                            )}
                            <span>paso {number.get(e.to)}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-text-2">Aquí termina el flujo.</p>
                  )}
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ol>
      <Card solid className="mt-4">
        <CardHeader title="Qué hay que saber" />
        <CardBody>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px]">
            {flow.know.map((k, i) => (
              <li key={i}>
                <Inline text={fill(k)} words={words} />
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

/** What a page shows for its search params: a flow of the page, a part of the page, or the index. */
export function WebGuidePage({ page, words, parte, flujo }: { page: WebPage; words: ClientWords; parte?: string; flujo?: string }) {
  const flow = flujo ? webEntry(flujo) : null;
  if (flow && 'nodes' in flow && webHref(flow.id)?.startsWith(`${WEB_PAGE_HREF[page]}?`)) return <WebGuideFlow page={page} flow={flow} words={words} />;
  const n = Number(parte);
  const view = Number.isInteger(n) ? webPart(n, page) : null;
  if (view) return <WebGuidePart page={page} view={view} words={words} />;
  return <WebGuideIndex page={page} words={words} />;
}
