import type { Metadata } from 'next';
import { DocumentRow } from '@/components/web/cards';
import { Breadcrumbs, EmptyState, Pagination } from '@/components/web/states';
import { Container, PageIntro } from '@/components/web/ui';
import { listItems } from '@/lib/web/cache';
import { pageParam, withQuery } from '@/lib/web/params';
import { pageMetadata } from '@/lib/web/seo';
import { getSite } from '@/lib/web/site';
import { navLabel } from '@/lib/web/site-settings';

// The Semanario lives on the website now (docs/diagnostico.md problem 6: it was a single PDF on Google Drive): every
// edition is a document of category «semanario» with its date, its cover and its file, on the site's own domain. Its
// name is the client's (config «brand.weeklyName»).
export const revalidate = 60;

const PER_PAGE = 20;

type Search = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ searchParams }: { searchParams: Search }): Promise<Metadata> {
  const [site, sp] = await Promise.all([getSite(), searchParams]);
  const page = pageParam(sp.pagina);
  return pageMetadata(
    {
      title: page > 1 ? `${site.weeklyName}, página ${page}` : site.weeklyName,
      description: `Ediciones del ${site.weeklyName} en formato PDF.`,
      path: withQuery('/actualidad/semanario', { pagina: page }),
    },
    site,
  );
}

export default async function WeeklyPage({ searchParams }: { searchParams: Search }) {
  const [site, sp] = await Promise.all([getSite(), searchParams]);
  const page = pageParam(sp.pagina);
  const { items, total } = await listItems({ kind: 'document', category: 'semanario', limit: PER_PAGE, offset: (page - 1) * PER_PAGE });
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  return (
    <>
      <Breadcrumbs items={[{ label: 'Inicio', href: '/' }, { label: navLabel(site, '/actualidad', 'Noticias'), href: '/actualidad' }, { label: 'Semanario' }]} />
      <PageIntro title={site.weeklyName} intro="Ediciones semanales en formato PDF." />
      <Container className="pb-20">
        {items.length ? (
          <ul className="border-b border-border">
            {items.map((d) => (
              <DocumentRow key={d.id} item={d} as="h2" />
            ))}
          </ul>
        ) : (
          <EmptyState title="Aún no hay ediciones publicadas." />
        )}
        <Pagination page={page} pages={pages} hrefFor={(p) => withQuery('/actualidad/semanario', { pagina: p })} label="Páginas del Semanario" />
      </Container>
    </>
  );
}
