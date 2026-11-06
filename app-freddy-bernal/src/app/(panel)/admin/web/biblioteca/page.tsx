import Image from 'next/image';
import Link from 'next/link';
import { FileText, Search } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { EmptyState, PageHeader } from '@/components/ui/page';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/field';
import { CmsNav } from '@/components/cms/chrome';
import { LibraryUpload } from '@/components/cms/library-upload';
import { MEDIA_PAGE_SIZE, mediaList, reviewQueue, webCaps } from '@/lib/data/web-admin';
import { ADMIN_WEB } from '@/lib/web/cms/kinds';
import { cn } from '@/lib/cn';

export const metadata = { title: 'Biblioteca · Web' };

type Search = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

// The public media library (design §3, §6): the photos and the PDFs the website uses, newest first, searchable by their
// words; upload with the alternative text (required) and a focal point. Files of people never come here: this library
// is public. Everyone of the web reads it; editors, the publisher and the boss upload and change its words.
export default async function LibraryPage({ searchParams }: { searchParams: Search }) {
  const s = await requireRole('writer', 'web_publisher', 'boss', 'admin');
  const sp = await searchParams;
  const q = one(sp.q).trim().slice(0, 80);
  const kind = one(sp.tipo) === 'documentos' ? 'document' : one(sp.tipo) === 'fotos' ? 'image' : null;
  const archived = one(sp.archivados) === '1';
  const page = Math.max(1, Number.parseInt(one(sp.pagina), 10) || 1);
  const data = await db(s, async (sql) => ({
    caps: await webCaps(sql),
    list: await mediaList(sql, { q, kind, archived, page }),
    waiting: (await reviewQueue(sql)).length,
  }));
  const { caps, list } = data;
  const pages = Math.max(1, Math.ceil(list.total / MEDIA_PAGE_SIZE));
  const hrefFor = (p: number) => {
    const u = new URLSearchParams();
    if (q) u.set('q', q);
    if (kind) u.set('tipo', kind === 'image' ? 'fotos' : 'documentos');
    if (archived) u.set('archivados', '1');
    if (p > 1) u.set('pagina', String(p));
    return `${ADMIN_WEB.media}${u.size ? `?${u}` : ''}`;
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col">
      <PageHeader title="Biblioteca" subtitle="Las fotos y los documentos de la web. Todo lo que está aquí es público: nunca fotos ni archivos de personas que escriben a Atención." back={{ href: ADMIN_WEB.home, label: 'La web' }} />
      <CmsNav current="biblioteca" caps={caps} waiting={data.waiting} />

      {caps.canEdit ? (
        <Card className="mb-5">
          <CardHeader title="Subir" subtitle="La foto se achica y pierde la ubicación antes de salir de este equipo. El texto alternativo es obligatorio." />
          <CardBody>
            <LibraryUpload />
          </CardBody>
        </Card>
      ) : null}

      <form action={ADMIN_WEB.media} method="get" role="search" aria-label="Buscar en la biblioteca" className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex flex-1 flex-col gap-1.5 text-sm font-semibold">
          Buscar
          <Input name="q" type="search" defaultValue={q} placeholder="Texto alternativo, pie, crédito o título" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold sm:w-44">
          Tipo
          <Select name="tipo" defaultValue={kind === 'image' ? 'fotos' : kind === 'document' ? 'documentos' : ''}>
            <option value="">Todo</option>
            <option value="fotos">Fotos</option>
            <option value="documentos">Documentos</option>
          </Select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="archivados" value="1" defaultChecked={archived} className="h-5 w-5 accent-[var(--c-accent)]" />
          Archivados
        </label>
        <button type="submit" className={buttonVariants({ variant: 'secondary' })}>
          <Search className="h-4 w-4" aria-hidden /> Buscar
        </button>
      </form>

      <p className="mb-2 text-sm text-text-2">{list.total === 1 ? '1 archivo' : `${list.total} archivos`}</p>
      {list.rows.length ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.rows.map((m) => (
            <li key={m.id}>
              <Card solid className="h-full overflow-hidden">
                <Link href={ADMIN_WEB.mediaItem(m.id)} className="flex h-full flex-col hover:bg-surface-2">
                  {m.kind === 'image' ? (
                    <span className="relative block aspect-[4/3] w-full bg-surface-2">
                      <Image src={m.url} alt={m.alt} fill sizes="(min-width: 1024px) 240px, (min-width: 640px) 33vw, 50vw" className="object-cover" style={{ objectPosition: `${m.focalX * 100}% ${m.focalY * 100}%` }} />
                    </span>
                  ) : (
                    <span className="grid aspect-[4/3] w-full place-items-center bg-surface-2 text-accent-ink">
                      <FileText className="h-10 w-10" aria-hidden />
                    </span>
                  )}
                  <span className="flex flex-col gap-0.5 p-2.5 text-sm">
                    <span className="line-clamp-2 font-medium">{m.kind === 'image' ? m.alt : m.title}</span>
                    <span className="text-xs text-text-2">
                      {m.kind === 'image' ? `${m.width} × ${m.height}` : 'PDF'} · {Math.max(1, Math.round(m.bytes / 1024))} KB
                    </span>
                  </span>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title={q || kind || archived ? 'Nada coincide con esa búsqueda.' : 'La biblioteca está vacía todavía: sube la primera foto.'} />
      )}
      {pages > 1 ? (
        <nav aria-label="Páginas" className="mt-4 flex items-center justify-between gap-2">
          <Link href={hrefFor(page - 1)} aria-disabled={page <= 1} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), page <= 1 && 'pointer-events-none opacity-50')}>
            ← Anteriores
          </Link>
          <span className="text-sm text-text-2">
            Página {page} de {pages}
          </span>
          <Link href={hrefFor(page + 1)} aria-disabled={page >= pages} className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), page >= pages && 'pointer-events-none opacity-50')}>
            Siguientes →
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
