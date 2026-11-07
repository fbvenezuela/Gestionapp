import type { ReactNode } from 'react';
import { safeHref, type TextNode, type TextRun } from '@/lib/web/blocks';

// The FAQ answers' structured text (src/lib/web/blocks.ts), rendered by our own code: paragraphs, lists and quotes,
// with bold, italic and links that pass safeHref (http, https, mailto or a path of this site). Never HTML. A small copy
// of what the site's block renderer does, for the attention desk's public pages: a «pending» slot (what an editor still
// has to write) draws nothing here (copy audit F1); the admin's preview shows it.

function Runs({ runs }: { runs: TextRun[] }) {
  return (
    <>
      {runs.map((r, i) => {
        let node: ReactNode = r.text;
        if (r.bold) node = <strong className="font-semibold">{node}</strong>;
        if (r.italic) node = <em>{node}</em>;
        if (r.href && safeHref.safeParse(r.href).success) {
          const external = /^https?:/i.test(r.href);
          node = (
            <a href={r.href} className="font-semibold text-accent-ink underline underline-offset-2" {...(external ? { rel: 'noopener noreferrer' } : {})}>
              {node}
            </a>
          );
        }
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}

const inline = (item: string | TextRun[]) => (typeof item === 'string' ? item : <Runs runs={item} />);

export function RichTextLite({ nodes }: { nodes: TextNode[] }) {
  return (
    <div className="flex flex-col gap-3 text-[17px] leading-relaxed text-text">
      {nodes.map((n, i) => {
        switch (n.type) {
          case 'heading':
            return (
              <p key={i} className="font-bold">
                {n.text}
              </p>
            );
          case 'paragraph':
            return <p key={i}>{n.runs ? <Runs runs={n.runs} /> : n.text}</p>;
          case 'list': {
            const items = n.items.map((it, j) => <li key={j}>{inline(it)}</li>);
            return n.ordered ? (
              <ol key={i} className="list-decimal pl-6">
                {items}
              </ol>
            ) : (
              <ul key={i} className="list-disc pl-6">
                {items}
              </ul>
            );
          }
          case 'quote':
            return (
              <blockquote key={i} className="border-l-4 border-accent pl-4 italic">
                {n.text}
                {n.cite ? <footer className="mt-1 text-[15px] not-italic text-text-2">{n.cite}</footer> : null}
              </blockquote>
            );
          case 'pending':
            return null;
          default:
            return null;
        }
      })}
    </div>
  );
}
