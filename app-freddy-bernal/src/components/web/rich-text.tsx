import { Fragment, type ReactNode } from 'react';
import { PencilLineIcon } from './icons';
import type { TextNode, TextRun } from '@/lib/web/blocks';
import { cn } from '@/lib/cn';
import { SafeLink } from './ui';

// The website's own renderer of structured text (design §3): headings, paragraphs, lists, quotes and «por completar»
// slots, with bold, italic and links. Every string is a React text child, so React escapes it: no HTML or script that
// an editor writes ever runs (there is no dangerouslySetInnerHTML here, and tests/unit/web-blocks-render.test.ts checks
// it); links go through SafeLink (https, http, mailto or a path of this site). Synchronous and pure.
//
// A «por completar» slot is the editors' note of what is missing: the public site never draws it (nor a heading left
// with nothing under it); the administrator's preview (`preview`) draws it, so editors see what is still to write.

// «Por completar desde el administrador: …», «Por completar: …»: the words the slot already says, at the start of a text.
const PENDING_PREFIX = /^por completar( desde el administrador)?\s*[:·.-]?\s*/i;

/** Whether a short text is still an editors' «por completar» note (the hero's text, for one). */
export function isPendingText(text: string): boolean {
  return PENDING_PREFIX.test(text.trim());
}

/** What the public sees of a structured text: no «por completar» slots, and no heading whose part has nothing left
 * (until the next heading of its level or above). */
export function publicNodes(nodes: TextNode[]): TextNode[] {
  const kept = nodes.filter((n) => n.type !== 'pending');
  return kept.filter((n, i) => {
    if (n.type !== 'heading') return true;
    for (const next of kept.slice(i + 1)) {
      if (next.type !== 'heading') return true;
      if (next.level <= n.level) return false;
    }
    return false;
  });
}

/** Line breaks the editor typed inside a paragraph, kept as <br>. */
function lines(text: string): ReactNode {
  const parts = text.split('\n');
  return parts.map((p, i) => (
    <Fragment key={i}>
      {i > 0 ? <br /> : null}
      {p}
    </Fragment>
  ));
}

export function Runs({ runs }: { runs: TextRun[] }) {
  return (
    <>
      {runs.map((r, i) => {
        let el: ReactNode = lines(r.text);
        if (r.italic) el = <em>{el}</em>;
        if (r.bold) el = <strong className="font-semibold">{el}</strong>;
        if (r.href) el = <SafeLink href={r.href} className="font-medium text-accent-ink underline decoration-2 underline-offset-4">{el}</SafeLink>;
        return <Fragment key={i}>{el}</Fragment>;
      })}
    </>
  );
}

/** The empty slot of the administrator's preview: what the editors still have to write (D-95). Never invented text,
 * and never on the public site. Its own words come once («Por completar · …», not «Por completar · Por completar: …»). */
export function PendingSlot({ text, className }: { text: string; className?: string }) {
  const rest = text.trim().replace(PENDING_PREFIX, '');
  return (
    <div className={cn('my-6 flex gap-3 rounded-2xl border-2 border-dashed border-accent bg-accent-soft p-4 text-[16px] leading-relaxed text-text', className)}>
      <PencilLineIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-ink" />
      <p>
        <span className="font-semibold text-accent-ink">{rest ? 'Por completar · ' : 'Por completar'}</span>
        {rest}
      </p>
    </div>
  );
}

function Node({ node, first }: { node: TextNode; first: boolean }) {
  switch (node.type) {
    case 'heading':
      return node.level === 2 ? (
        <h2 className={cn('text-2xl font-bold leading-tight tracking-tight text-text sm:text-[1.75rem]', first ? '' : 'mt-10')}>{node.text}</h2>
      ) : (
        <h3 className={cn('text-xl font-semibold leading-snug text-text', first ? '' : 'mt-8')}>{node.text}</h3>
      );
    case 'paragraph':
      return <p className={cn(first ? '' : 'mt-4')}>{node.runs ? <Runs runs={node.runs} /> : lines(node.text ?? '')}</p>;
    case 'list': {
      const Tag = node.ordered ? 'ol' : 'ul';
      return (
        <Tag className={cn('space-y-2 pl-6', node.ordered ? 'list-decimal' : 'list-disc', first ? '' : 'mt-4')}>
          {node.items.map((it, i) => (
            <li key={i} className="pl-1">
              {typeof it === 'string' ? lines(it) : <Runs runs={it} />}
            </li>
          ))}
        </Tag>
      );
    }
    case 'quote':
      return (
        <figure className={cn('border-l-4 border-action pl-5', first ? '' : 'mt-8')}>
          <blockquote className="text-xl font-medium leading-relaxed text-text">
            <p>{lines(node.text)}</p>
          </blockquote>
          {node.cite ? <figcaption className="mt-2 text-base font-semibold text-text-2">{node.cite}</figcaption> : null}
        </figure>
      );
    case 'pending':
      return <PendingSlot text={node.text} className={first ? 'mt-0' : undefined} />;
  }
}

/** A piece of structured text, at reading size: what the public sees, or everything with its «por completar» slots in
 * the administrator's preview. */
export function RichText({ nodes, className, preview = false }: { nodes: TextNode[]; className?: string; preview?: boolean }) {
  const shown = preview ? nodes : publicNodes(nodes);
  if (!shown.length) return null;
  return (
    <div className={cn('text-[17px] leading-relaxed text-text sm:text-lg', className)}>
      {shown.map((n, i) => (
        <Node key={i} node={n} first={i === 0} />
      ))}
    </div>
  );
}
