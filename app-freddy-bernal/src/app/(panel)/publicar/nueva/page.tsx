import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { LinkButton } from '@/components/ui/button';
import { loadPublishContext, validateFor } from '@/lib/data/publish';
import { NewPublication } from './new-publication';

export const metadata = { title: 'Nueva publicación' };

export default async function NewPublicationPage({ searchParams }: { searchParams: Promise<{ pieza?: string; republica?: string }> }) {
  const s = await requireRole('admin', 'social');
  const { pieza, republica } = await searchParams;
  const data = await db(s, async (sql) => {
    const approved = await sql.query<{ id: string; title: string }>(`select id, title from public.pieces where status = 'approved' and deleted_at is null order by approved_at desc limit 50`);
    const ctx = pieza ? await loadPublishContext(sql, pieza) : null;
    const prev = republica ? await sql.one<{ id: string; network: string; published_at: string | null }>(`select id, network, published_at from public.publications where id = $1`, [republica]) : null;
    const pastPubs = pieza ? await sql.query<{ id: string; network: string; published_at: string | null }>(`select id, network, published_at from public.publications where piece_id = $1 and status = 'published' order by published_at desc`, [pieza]) : [];
    return { approved, ctx, prev, pastPubs };
  });
  const checks = data.ctx && data.ctx.piece.status === 'approved' ? data.ctx.specs.map((sp) => validateFor(data.ctx!, sp.network)) : [];
  if (!data.approved.length && !data.ctx) {
    return (
      <>
        <PageHeader title="Nueva publicación" back={{ href: '/publicar', label: 'Publicar' }} />
        <EmptyState title="No hay piezas aprobadas. Supervisión tiene que aprobar antes de publicar." action={<LinkButton href="/piezas">Ver piezas</LinkButton>} />
      </>
    );
  }
  return (
    <>
      <PageHeader title="Nueva publicación" subtitle="Revisamos el video para cada red antes de programar." back={{ href: '/publicar', label: 'Publicar' }} />
      <NewPublication
        approved={data.approved}
        pieceId={pieza ?? ''}
        pieceTitle={data.ctx?.piece.title ?? ''}
        pieceStatus={data.ctx?.piece.status ?? ''}
        checks={checks}
        collaborators={data.ctx?.collaborators ?? []}
        republishOf={data.prev?.id ?? null}
        pastPubs={data.pastPubs}
      />
    </>
  );
}
