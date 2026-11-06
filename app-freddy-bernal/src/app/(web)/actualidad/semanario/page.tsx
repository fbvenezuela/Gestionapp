import type { Metadata } from 'next';
import { DocumentRow } from '@/components/web/cards';
import { Breadcrumbs, EmptyState, Pagination } from '@/components/web/states';
import { Container, PageIntro } from '@/components/web/ui';
import { listItems } from '@/lib/web/cache';
import { pageParam, withQuery } from '@/lib/web/params';
import { pageMetadata } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';

// The Semanario lives on the website now (docs/diagnostico.md problem 6: it was a single PDF on Google Drive): every
// issue is a document of category «semanario» with its date, its version and its file, on the site's own domain.
export const revalidate = 60;

const PER_PAGE = 20;

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [site, sp] = await Promise.all([getSite(), searchParams]);
  const page = pageParam(sp.pagina);
  return pageMetadata(
    {
      title: page > 1 ? `Semanario, página ${page}` : 'Semanario',
      description: 'El boletín semanal de la gestión: cada número con su fecha, para leer o descargar en esta web.',
      path: withQuery('/actualidad/semanario', { pagina: page }),
    },
    site,
  );
}

export default async function WeeklyPage({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const page = pageParam(sp.pagina);
  const { items, total } = await listItems({ kind: 'document', category: 'semanario', limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  return (
    <>
      <Breadcrumbs items={[{ label: 'Inicio', href: '/' }, { label: 'Actualidad', href: '/actualidad' }, { label: 'Semanario' }]} />
      <PageIntro eyebrow="Actualidad" title="Semanario" intro="El boletín de cada semana, con su fecha y su archivo, para leer o descargar aquí mismo." />
      <Container className="pb-20">
        {items.length ? (
          <ul className="border-b border-border">
            {items.map((d) => (
              <DocumentRow key={d.id} item={d} as="h2" />
            ))}
          </ul>
        ) : (
          <EmptyState title="Todavía no hay números del Semanario publicados.">Cada número aparece aquí cuando el equipo lo publica.</EmptyState>
        )}
        <Pagination page={page} pages={pages} hrefFor={(p) => withQuery('/actualidad/semanario', { pagina: p })} label="Páginas del Semanario" />
      </Container>
    </>
  );
}
