import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

export type PubTitleRow = { id: string; title: string; url: string | null };

// Who can open /publicar/[id] (admin, redes, jefe) goes there; anyone else goes to the
// post itself on the network when there is a link, or see just the title. Never a dead «#» link.
// On the phone card (`card`) the title is the main tap target: a full-width block at least 44 px
// tall and underlined so it reads as a link. In the desktop table it stays inline.
export function PubTitle({ r, canLoad, card = false }: { r: PubTitleRow; canLoad: boolean; card?: boolean }) {
  const link = card ? 'flex min-h-11 items-center gap-1 font-semibold underline underline-offset-4' : 'font-semibold hover:underline';
  if (canLoad) return <Link href={`/publicar/${r.id}`} className={link}>{r.title}</Link>;
  if (r.url) {
    return (
      <a href={r.url} target="_blank" rel="noreferrer" className={link}>
        {r.title} <ExternalLink className="inline h-3.5 w-3.5 shrink-0 align-[-2px]" aria-hidden /><span className="sr-only"> (se abre en la red)</span>
      </a>
    );
  }
  return <span className="font-semibold">{r.title}</span>;
}
