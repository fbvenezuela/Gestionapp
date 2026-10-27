import Link from 'next/link';
import { ChevronRight, HardHat, Plus } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { listObraFichas, obraStageCounts, type ObraListItem } from '@/lib/data/fichas';
import { municipalities } from '@/lib/data/common';
import { OBRA_STAGE, OBRA_STAGES, WORK_STATE, type ObraStage, type WorkState } from '@/lib/data/ficha-labels';
import { PageHeader, EmptyState } from '@/components/ui/page';
import { Card, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Button, LinkButton } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { fmtDate } from '@/lib/time';

export const metadata = { title: 'Fichas de obra' };

// The obra fichas (§4.1): what the Director del IVT loads before each visit of the boss. «Por ponerle fecha» on top:
// the boss or despacho put the date. Home of the IVT.
const SECTIONS: { stage: ObraStage; title: string; subtitle?: string }[] = [
  { stage: 'to_schedule', title: 'Por ponerle fecha', subtitle: 'Listas: el jefe o el despacho les ponen fecha y hora.' },
  { stage: 'draft', title: 'Borradores', subtitle: 'Todavía no le llegan al jefe.' },
  { stage: 'scheduled', title: 'Con fecha' },
  { stage: 'done', title: 'Visitas realizadas' },
  { stage: 'archived', title: 'Archivadas' },
];

export default async function ObrasPage({ searchParams }: { searchParams: Promise<{ municipio?: string; estado?: string }> }) {
  const s = await requireRole('admin', 'boss', 'dispatch', 'ivt');
  const sp = await searchParams;
  const stage = (OBRA_STAGES as readonly string[]).includes(sp.estado ?? '') ? sp.estado : undefined;
  const data = await db(s, async (sql) => {
    const list = await listObraFichas(sql, { municipality: sp.municipio || undefined, stage });
    return { list, municipalities: await municipalities(sql), counts: await obraStageCounts(sql) };
  });
  const filtered = !!(sp.municipio || stage);
  const by = (st: ObraStage) => data.list.filter((f) => f.stage === st);

  return (
    <>
      <PageHeader
        title="Fichas de obra"
        subtitle="La ficha de cada obra antes de la visita del jefe. Sin fecha ni hora: esa la ponen el jefe o el despacho."
        actions={
          <LinkButton href="/obras/nueva" size="lg">
            <Plus className="h-5 w-5" aria-hidden /> Nueva ficha de obra
          </LinkButton>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {OBRA_STAGES.filter((st) => st !== 'archived').map((st) => (
          <Chip key={st} tone={OBRA_STAGE[st].tone}>
            {OBRA_STAGE[st].label}: {data.counts[st] ?? 0}
          </Chip>
        ))}
      </div>

      <Card className="mb-5 p-4">
        <form method="get" action="/obras" className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
            Municipio
            <Select name="municipio" defaultValue={sp.municipio ?? ''}>
              <option value="">Todos</option>
              {data.municipalities.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </Select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold">
            Estado
            <Select name="estado" defaultValue={stage ?? ''}>
              <option value="">Todos (sin archivadas)</option>
              {OBRA_STAGES.map((st) => (
                <option key={st} value={st}>{OBRA_STAGE[st].label}</option>
              ))}
            </Select>
          </label>
          <div className="flex items-center gap-2">
            <Button type="submit" variant="secondary">Filtrar</Button>
            {filtered ? <Link href="/obras" className="inline-flex min-h-11 items-center px-2 text-[15px] font-semibold text-accent-ink">Quitar</Link> : null}
          </div>
        </form>
      </Card>

      {data.list.length ? (
        <div className="flex flex-col gap-5">
          {SECTIONS.map((sec) => {
            const rows = by(sec.stage);
            if (!rows.length) return null;
            return (
              <Card key={sec.stage}>
                <CardHeader title={`${sec.title} (${rows.length})`} subtitle={sec.subtitle} />
                <ObraList rows={rows} />
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<HardHat className="h-8 w-8" />}
          title={filtered ? 'No hay fichas con ese filtro.' : 'Todavía no hay fichas de obra. Carga la primera: sin fecha ni hora.'}
          action={<LinkButton href="/obras/nueva">Nueva ficha de obra</LinkButton>}
        />
      )}
    </>
  );
}

function ObraList({ rows }: { rows: ObraListItem[] }) {
  return (
    <ul className="divide-y divide-border">
      {rows.map((f) => (
        <li key={f.id}>
          <Link href={`/obras/${f.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-surface-2">
            <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
              <span className="min-w-0 sm:flex-1">
                <span className="block font-semibold [overflow-wrap:anywhere]">{f.name}</span>
                <span className="block text-sm text-text-2 [overflow-wrap:anywhere]">
                  {f.code} · {[f.municipality, f.parish].filter(Boolean).join(', ')}
                  {f.progress_pct !== null ? ` · ${f.progress_pct} % de avance` : f.work_state ? ` · ${WORK_STATE[f.work_state as WorkState]?.label ?? ''}` : ''}
                  {` · actualizada el ${fmtDate(f.updated_at, "d 'de' LLL")}`}
                </span>
              </span>
              <Chip tone={OBRA_STAGE[f.stage].tone} className="shrink-0 self-start sm:self-center">{OBRA_STAGE[f.stage].label}</Chip>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
