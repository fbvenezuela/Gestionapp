import Link from 'next/link';
import { Download, Inbox } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader, Stat, EmptyState } from '@/components/ui/page';
import { Card, CardBody } from '@/components/ui/card';
import { DeskNav } from '@/components/attention/desk-nav';
import { InboxFilters } from '@/components/attention/inbox-filters';
import { Pagination, RequestList, StateCounts } from '@/components/attention/request-list';
import { Board } from '@/components/attention/board';
import { assigneeOptions, boardRows, deskCatalogs, inboxPage, inboxSummary, stateCounts } from '@/lib/data/attention';
import { deskAccess, hasFilters, inboxQuery, parseInboxFilters, typesFor } from '@/lib/domain/attention';

export const metadata = { title: 'Atención' };

// The attention desk's inbox (design §5, D-92, D-93): what people send from the website, as this person may read it
// (RLS: the coordinator everything; a responsible, their areas' and theirs, never a denuncia; the denuncias operator,
// only denuncias; the auditor and the boss, everything but denuncias, read only). A list (a table from the tablet up)
// or a board by state, with the search by code and the filters in the address. Administración never reads a case: it
// gets the desk's areas, catalogues and plazos.
export default async function AttentionInboxPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await requireRole('attention_coordinator', 'reports_operator', 'complaints_operator', 'auditor', 'boss', 'admin');
  const access = deskAccess(s.roles);
  if (!access.readsCases) return <AdminDesk />;
  const f = parseInboxFilters(await searchParams);
  const board = f.view === 'tablero';
  const data = await db(s, async (sql) => {
    const summary = await inboxSummary(sql);
    const catalogs = await deskCatalogs(sql);
    const assignees = await assigneeOptions(sql);
    // The board shows every state: the state filter is the list's.
    const bf = board ? { ...f, state: null } : f;
    const counts = await stateCounts(sql, bf, s.userId);
    if (board) return { summary, catalogs, assignees, counts, board: await boardRows(sql, bf, s.userId), list: null };
    return { summary, catalogs, assignees, counts, board: null, list: await inboxPage(sql, f, s.userId) };
  });
  const c = data.summary;
  const readOnly = !access.works;
  // The CSV takes the same filters (never the page or the view); the contact only when asked.
  const exportHref = (withContact: boolean) => {
    const params = new URLSearchParams(inboxQuery({ ...f, page: 1, view: 'lista' }).slice(1));
    if (withContact) params.set('contacto', '1');
    const q = params.toString();
    return `/admin/atencion/exportar${q ? `?${q}` : ''}`;
  };
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Atención ciudadana"
        subtitle={
          readOnly
            ? 'Lo que llega de la web, para consultar: sin contactos ni cambios.'
            : 'Lo que llega de la web: reportes, peticiones, observaciones, sugerencias, reconocimientos y denuncias.'
        }
      />
      <DeskNav access={access} current={board ? 'tablero' : 'bandeja'} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Por revisar" value={c.arrived} tone={c.arrived ? 'accent' : undefined} />
        <Stat label="En atención" value={c.working} />
        <Stat label="Resueltas" value={c.resolved} tone="ok" />
        <Stat label="Vencidas" value={c.overdue} tone={c.overdue ? 'danger' : undefined} />
      </div>
      <InboxFilters f={f} catalogs={data.catalogs} assignees={data.assignees} types={typesFor(s.roles)} />
      {board && data.board ? (
        <Board f={f} rows={data.board} counts={data.counts} />
      ) : data.list ? (
        <>
          <StateCounts f={f} counts={data.counts} />
          {data.list.rows.length ? (
            <>
              <RequestList rows={data.list.rows} />
              <Pagination f={f} page={data.list.page} pages={data.list.pages} total={data.list.total} />
            </>
          ) : (
            <EmptyState
              icon={<Inbox className="h-8 w-8" />}
              title={hasFilters(f) ? 'No hay solicitudes con esos filtros.' : 'Todavía no hay solicitudes que te toquen.'}
              action={hasFilters(f) ? <Link href="/admin/atencion" className="inline-flex min-h-11 items-center font-semibold text-accent-ink">Quitar los filtros</Link> : undefined}
            />
          )}
        </>
      ) : null}
      {access.exports ? (
        <Card className="mt-6">
          <CardBody className="flex flex-col gap-2 text-[15px]">
            <p className="font-semibold">Exportar lo que ves (CSV)</p>
            <p className="text-text-2">
              Con los filtros de arriba. El archivo se abre en Excel con los acentos bien. No lleva descripciones, mensajes ni archivos. Queda registrado quién exportó y cuándo.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <a href={exportHref(false)} className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent-ink" download>
                <Download className="h-4 w-4" aria-hidden /> Descargar CSV
              </a>
              {access.exportsContacts ? (
                <a href={exportHref(true)} className="inline-flex min-h-11 items-center gap-2 font-semibold text-accent-ink" download>
                  <Download className="h-4 w-4" aria-hidden /> Descargar con el contacto (queda registrado caso por caso)
                </a>
              ) : null}
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

/** Administración at the desk (D-93): the areas, who is in each, the categories and the plazos; never a case. */
function AdminDesk() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <PageHeader title="Atención ciudadana" subtitle="Lo que llega de la web lo atienden la coordinación y cada área." />
      <Card>
        <CardBody className="flex flex-col gap-3 text-[15px]">
          <p className="text-text-2">
            Administración no lee las solicitudes ni sus contactos. Aquí armas lo que la atención necesita para funcionar: las áreas, quién
            está en cada una, el área y los días de cada categoría, los plazos por prioridad y cuándo avisar de un caso sin movimiento.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/admin/atencion/areas" className="inline-flex min-h-11 w-fit items-center rounded-[var(--radius-control)] bg-accent px-4 font-semibold text-on-accent hover:bg-accent-hover">
              Áreas y plazos
            </Link>
            <Link href="/admin/atencion/registro" className="inline-flex min-h-11 items-center font-semibold text-accent-ink underline-offset-2 hover:underline">
              Registro de atención
            </Link>
          </div>
          <p className="text-text-2">
            Las personas de la atención (coordinación, responsables de área, denuncias y auditoría) se invitan en{' '}
            <Link href="/ajustes/equipo" className="font-semibold text-accent-ink underline-offset-2 hover:underline">Ajustes → Equipo</Link>, siempre con doble
            factor.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
