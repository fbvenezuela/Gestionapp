import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import type { Session } from '@/lib/auth/session';
import * as admin from '@/lib/assistant/admin';
import { fmtDateTime, fmtDay } from '@/lib/time';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Input } from '@/components/ui/field';
import { EmptyState, Stat } from '@/components/ui/page';
import {
  DRAFT_STATUS,
  PANEL_PATH,
  actionLabel,
  draftTarget,
  fmtMs,
  fmtUsd,
  idParam,
  keyStatus,
  pageParam,
  pairAnswers,
  tabHref,
  toolLabel,
  type TabKey,
} from '@/components/assistant/panel-core';
import { KnowledgeBoard } from './knowledge-board';
import { ScriptBoard } from './script-board';
import { AnswerActions } from './answer-actions';
import { HeardBoard } from './heard-board';
import { DraftActions, ProbeChain, ProfileForm, UndoButton } from './panel-buttons';

// The eight tabs of Ajustes → Asistente, read on the server through the backend's admin
// functions (each one checks administration with 2FA; they use withSystem, so they are never
// called inside db(session, …)).

export type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

function Filters({ tab, options, param, current }: { tab: TabKey; options: { value: string; label: string }[]; param: string; current: string }) {
  return (
    <ul className="mb-3 flex flex-wrap gap-2" aria-label="Filtro">
      {options.map((o) => (
        <li key={o.value}>
          <Link
            href={tabHref(tab, { [param]: o.value })}
            aria-current={o.value === current ? 'true' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center rounded-[var(--radius-control)] border px-3 text-sm font-semibold',
              o.value === current ? 'border-accent bg-accent-soft text-accent-ink' : 'border-border bg-surface text-text-2 hover:bg-surface-2 hover:text-text',
            )}
          >
            {o.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function SearchForm({ tab, q, label, children }: { tab: TabKey; q: string; label: string; children?: React.ReactNode }) {
  return (
    <form action={PANEL_PATH} method="get" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="tab" value={tab} />
      <Field label={label} htmlFor={`buscar-${tab}`} className="flex-1">
        <Input id={`buscar-${tab}`} name="q" type="search" defaultValue={q} />
      </Field>
      {children}
      <Button type="submit" variant="secondary">
        <Search className="h-4 w-4" aria-hidden /> Buscar
      </Button>
    </form>
  );
}

// Lo que sabe -----------------------------------------------------------------------
const KNOWLEDGE_VIEWS = [
  { value: 'todas', label: 'Todas' },
  { value: 'automaticas', label: 'Automáticas' },
  { value: 'equipo', label: 'Del equipo' },
  { value: 'apagadas', label: 'Apagadas' },
];

export async function KnowledgeTab({ s, sp }: { s: Session; sp: SP }) {
  const q = one(sp.q);
  const view = KNOWLEDGE_VIEWS.some((v) => v.value === one(sp.ver)) ? one(sp.ver) : 'todas';
  const rows = await admin.listKnowledge(s, {
    q,
    origin: view === 'automaticas' ? 'plataforma' : view === 'equipo' ? 'equipo' : undefined,
    active: view === 'apagadas' ? false : undefined,
  });
  return (
    <>
      <p className="mb-4 max-w-2xl text-[15px] text-text-2">
        Las fichas son lo que el asistente sabe. Las <b>automáticas</b> salen de los ajustes (fórmulas, reglas por red, horarios, marca, categorías) y se
        actualizan solas; las del equipo las escribe administración. Nada de esto lleva fechas: va al proveedor de IA.
      </p>
      <SearchForm tab="sabe" q={q} label="Buscar en lo que sabe">
        <input type="hidden" name="ver" value={view} />
      </SearchForm>
      <Filters tab="sabe" param="ver" current={view} options={KNOWLEDGE_VIEWS} />
      <KnowledgeBoard
        rows={rows.map((k) => ({
          id: k.id,
          title: k.title,
          body: k.body,
          roles: k.roles ?? [],
          tags: k.tags ?? [],
          active: k.active,
          automatic: k.automatic,
          origin: k.origin,
          updated: fmtDateTime(k.updated_at),
        }))}
      />
    </>
  );
}

// Cómo contesta -----------------------------------------------------------------------
export async function ScriptsTab({ s, sp }: { s: Session; sp: SP }) {
  const q = one(sp.q);
  const rows = await admin.listScripts(s, { q });
  return (
    <>
      <p className="mb-4 max-w-2xl text-[15px] text-text-2">
        Los guiones enseñan el tono y la forma de contestar. Para cada pregunta entran los tres que más le tocan. Uno malo se apaga y deja de influir en el acto.
      </p>
      <ScriptBoard
        rows={rows.map((r) => ({
          id: r.id,
          topic: r.topic,
          triggers: r.triggers ?? [],
          script: r.script,
          notes: r.notes ?? '',
          always: r.always,
          roles: r.roles ?? [],
          active: r.active,
          origin: r.origin,
          timesUsed: r.times_used,
          lastUsed: r.last_used_at ? fmtDateTime(r.last_used_at) : null,
        }))}
      />
      <div className="mt-4">
        <SearchForm tab="contesta" q={q} label="Buscar guiones" />
      </div>
    </>
  );
}

// Conversaciones -----------------------------------------------------------------------
const CONV_FILTERS = [
  { value: 'todas', label: 'Todas' },
  { value: 'avisos', label: 'Pidieron una persona' },
  { value: 'problemas', label: 'Con problemas' },
];
const PER_PAGE = 30;

type ToolMark = { tool?: string; ok?: boolean; error?: string };

export async function ConversationsTab({ s, sp }: { s: Session; sp: SP }) {
  const id = idParam(sp.conversacion);
  if (id) return <ConversationDetail s={s} id={id} />;
  const filter = CONV_FILTERS.some((f) => f.value === one(sp.filtro)) ? one(sp.filtro) : 'todas';
  const page = pageParam(sp.pagina);
  const rows = await admin.listConversations(s, { limit: PER_PAGE + 1, offset: (page - 1) * PER_PAGE, onlyEscalated: filter === 'avisos', onlyProblems: filter === 'problemas' });
  const more = rows.length > PER_PAGE;
  return (
    <>
      <Filters tab="conversaciones" param="filtro" current={filter} options={CONV_FILTERS} />
      {rows.length === 0 ? (
        <EmptyState title="Todavía no hay conversaciones con ese filtro." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.slice(0, PER_PAGE).map((c) => (
              <li key={c.id}>
                <Link href={tabHref('conversaciones', { conversacion: c.id })} className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold [overflow-wrap:anywhere]">{c.title || 'Sin título'}</span>
                    <span className="block text-sm text-text-2">
                      {c.person} · {fmtDateTime(c.last_at)} · {c.messages} {c.messages === 1 ? 'mensaje' : 'mensajes'}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1.5">
                      {c.escalated_at ? <Chip tone="warn">Pidió una persona</Chip> : null}
                      {c.degraded ? <Chip tone="danger">{c.degraded} con problemas</Chip> : null}
                      {c.errors ? <Chip tone="danger">{c.errors} {c.errors === 1 ? 'error' : 'errores'}</Chip> : null}
                      {c.models.map((m) => (
                        <Chip key={m} tone="neutral">{m === 'local' ? 'demostración' : m}</Chip>
                      ))}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="mt-3 flex justify-between gap-2">
        {page > 1 ? (
          <Link href={tabHref('conversaciones', { filtro: filter, pagina: page - 1 })} className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent-ink">
            <ChevronLeft className="h-4 w-4" aria-hidden /> Más nuevas
          </Link>
        ) : (
          <span />
        )}
        {more ? (
          <Link href={tabHref('conversaciones', { filtro: filter, pagina: page + 1 })} className="inline-flex min-h-11 items-center gap-1 font-semibold text-accent-ink">
            Más antiguas <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
      </div>
    </>
  );
}

async function ConversationDetail({ s, id }: { s: Session; id: string }) {
  const conv = await admin.getConversation(s, id);
  const back = (
    <Link href={tabHref('conversaciones')} className="mb-3 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-text-2 hover:text-text">
      <ChevronLeft className="h-4 w-4" aria-hidden /> Todas las conversaciones
    </Link>
  );
  if (!conv) return <>{back}<EmptyState title="Esa conversación no existe." /></>;
  const questionOf = new Map(pairAnswers(conv.messages).map((p) => [p.answer.id, p.question]));
  return (
    <>
      {back}
      <Card className="mb-4">
        <CardHeader title={conv.title || 'Conversación'} subtitle={`${conv.person} · empezó ${fmtDateTime(conv.created_at)}`} />
        {conv.escalated_at ? (
          <CardBody className="text-[15px]">
            <Chip tone="warn">Pidió una persona</Chip> <span className="text-text-2">{fmtDateTime(conv.escalated_at)}</span>
            {conv.escalated_reason ? <p className="mt-1">Motivo: {conv.escalated_reason}</p> : null}
          </CardBody>
        ) : null}
      </Card>
      <ol className="flex flex-col gap-3">
        {conv.messages.map((m) => {
          const tools = (Array.isArray(m.tools) ? m.tools : []) as ToolMark[];
          const goTo = m.go_to as { href?: string; label?: string } | null;
          return (
            <li key={m.id} className={cn('flex flex-col gap-2', m.who === 'persona' ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[90%] whitespace-pre-wrap rounded-[var(--radius-card)] px-3 py-2 text-[15px] [overflow-wrap:anywhere]',
                  m.who === 'persona' ? 'rounded-br-sm bg-accent-soft' : 'rounded-bl-sm border border-border bg-surface',
                  m.degraded && 'border-warn/40 bg-warn-soft',
                )}
              >
                <span className="sr-only">{m.who === 'persona' ? 'Persona: ' : 'Asistente: '}</span>
                {m.body}
              </div>
              {m.who === 'asistente' ? (
                <>
                  <p className="text-xs text-text-2">
                    {m.model === 'local' ? 'Demostración, sin IA' : m.model ?? 'sin modelo'} · {fmtMs(m.ms)}
                    {m.tokens_in || m.tokens_out ? ` · uso de IA: ${((m.tokens_in ?? 0) + (m.tokens_out ?? 0)).toLocaleString('es-VE')}` : ''} · {fmtDateTime(m.created_at)}
                  </p>
                  {tools.length || m.degraded || m.error || goTo?.href ? (
                    <div className="flex max-w-full flex-wrap gap-1.5">
                      {m.degraded ? <Chip tone="danger">Con problemas</Chip> : null}
                      {tools.map((t, i) => (
                        <Chip key={`${t.tool}-${i}`} tone={t.ok === false || t.error ? 'danger' : 'ok'}>
                          {toolLabel(t.tool)}
                          {t.error ? ': falló' : ''}
                        </Chip>
                      ))}
                      {goTo?.href ? <Chip tone="info">Botón: {goTo.label}</Chip> : null}
                    </div>
                  ) : null}
                  {m.error ? <p className="max-w-full text-xs text-danger [overflow-wrap:anywhere]">Error: {m.error}</p> : null}
                  <AnswerActions conversationId={conv.id} messageId={m.id} question={questionOf.get(m.id) ?? ''} canKeep={!m.degraded && !m.error} />
                </>
              ) : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}

// Cómo va -----------------------------------------------------------------------
export async function HealthTab({ s }: { s: Session }) {
  const h = await admin.healthStats(s, { days: 14 });
  const ratio = h.lastHour.answers ? Math.round((h.lastHour.degraded / h.lastHour.answers) * 100) : 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Última hora" value={h.lastHour.answers} hint={`${h.lastHour.degraded} con problemas (${ratio} %)`} tone={ratio > 20 ? 'danger' : undefined} />
        <Stat label="Gasto del mes" value={fmtUsd(h.spendMonthUsd)} hint={`Tope: ${fmtUsd(h.capUsd)}`} tone={h.spendMonthUsd >= h.capUsd ? 'danger' : undefined} />
        <Stat label="Cómo contesta" value={!h.enabled ? 'Apagado' : h.demo ? 'Demostración' : 'Con IA'} hint={h.demo ? 'Sin IA: guiones y fichas' : `${h.chain.length} ${h.chain.length === 1 ? 'modelo' : 'modelos'} en la cadena`} />
      </div>

      <Card>
        <CardHeader title="Claves de los proveedores" subtitle="Solo se dice si existen. Los valores nunca se muestran." />
        <CardBody>
          {h.demo ? (
            <p className="text-[15px] text-text-2">Sin IA conectada: contesta el modo demostración, con guiones y fichas, sin gasto.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              <li className="text-sm text-text-2">Cadena: {h.chain.join(' → ')}</li>
              {h.keys.map((k) => {
                const st = keyStatus(k);
                return (
                  <li key={k.provider} className="flex flex-wrap items-center gap-2 text-[15px]">
                    <Chip tone={st.tone}>{k.provider}</Chip>
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{st.text}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <ProbeChain />

      <Card>
        <CardHeader title="Por día" subtitle="Últimos 14 días" />
        {h.days.length === 0 ? (
          <CardBody className="text-[15px] text-text-2">Todavía nadie le ha preguntado nada.</CardBody>
        ) : (
          <ul className="divide-y divide-border">
            {h.days.map((d) => (
              <li key={d.day} className="px-4 py-3">
                <p className="font-semibold first-letter:uppercase">{fmtDay(d.day, "cccc d 'de' LLL")}</p>
                <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-4">
                  <Pair k="Conversaciones" v={d.conversations} />
                  <Pair k="Preguntas" v={d.questions} />
                  <Pair k="Con problemas" v={d.degraded} bad={d.degraded > 0} />
                  <Pair k="Errores" v={d.errors} bad={d.errors > 0} />
                  <Pair k="Tiempo medio" v={fmtMs(d.avg_ms)} />
                  <Pair k="Uso de IA" v={(d.tokens_in + d.tokens_out).toLocaleString('es-VE')} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Por modelo" subtitle="Últimos 14 días" />
        {h.byModel.length === 0 ? (
          <CardBody className="text-[15px] text-text-2">Sin respuestas todavía.</CardBody>
        ) : (
          <ul className="divide-y divide-border">
            {h.byModel.map((m) => (
              <li key={m.model} className="px-4 py-3">
                <p className="font-semibold [overflow-wrap:anywhere]">{m.model === 'local' ? 'Demostración (sin IA)' : m.model}</p>
                <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-sm sm:grid-cols-4">
                  <Pair k="Respuestas" v={m.answers} />
                  <Pair k="Errores" v={m.errors} bad={m.errors > 0} />
                  <Pair k="Con problemas" v={m.degraded} bad={m.degraded > 0} />
                  <Pair k="Tiempo medio" v={fmtMs(m.avg_ms)} />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Pair({ k, v, bad }: { k: string; v: React.ReactNode; bad?: boolean }) {
  return (
    <div className="flex justify-between gap-2 sm:block">
      <dt className="text-text-2">{k}</dt>
      <dd className={cn('tabular font-semibold', bad && 'text-danger')}>{v}</dd>
    </div>
  );
}

// Lo que preguntan -----------------------------------------------------------------------
export async function HeardTab({ s }: { s: Session }) {
  const groups = await admin.heardGrouped(s, { days: 30, limit: 100 });
  return (
    <>
      <p className="mb-4 max-w-2xl text-[15px] text-text-2">
        Lo que el equipo le preguntó en los últimos 30 días y todavía no tiene ficha, agrupado por pregunta parecida. Correos, teléfonos, fechas y horas ya
        salen tachados. Es la forma más directa de saber qué le falta.
      </p>
      <HeardBoard groups={groups.map((g) => ({ plain: g.plain, sample: g.sample, times: g.times, roles: g.roles ?? [], last: fmtDateTime(g.last_at), ids: g.ids }))} />
    </>
  );
}

// Por confirmar -----------------------------------------------------------------------
const DRAFT_FILTERS = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'todos', label: 'Todos' },
];

export async function DraftsTab({ s, sp }: { s: Session; sp: SP }) {
  const status = one(sp.estado) === 'todos' ? 'todos' : 'pendiente';
  const rows = await admin.listDrafts(s, status);
  return (
    <>
      <p className="mb-4 max-w-2xl text-[15px] text-text-2">Lo que el asistente dejó preparado. Nada sale hasta que administración lo confirma aquí.</p>
      <Filters tab="confirmar" param="estado" current={status} options={DRAFT_FILTERS} />
      {rows.length === 0 ? (
        <EmptyState title={status === 'pendiente' ? 'No hay nada por confirmar.' : 'El asistente no ha preparado nada todavía.'} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((d) => {
            const to = draftTarget(d.target);
            const result = (d.result ?? null) as { enviados?: number } | null;
            return (
              <li key={d.id}>
                <Card>
                  <CardHeader
                    title={d.summary}
                    subtitle={`Lo pidió ${d.created_by_name ?? 'alguien del equipo'} · ${fmtDateTime(d.created_at)}`}
                    action={<Chip tone={d.status === 'pendiente' ? 'warn' : d.status === 'confirmado' ? 'ok' : 'neutral'}>{DRAFT_STATUS[d.status] ?? d.status}</Chip>}
                  />
                  <CardBody className="flex flex-col gap-3">
                    <dl className="flex flex-col gap-2 text-[15px]">
                      <div>
                        <dt className="label-caps">A quién iría</dt>
                        <dd>{to}</dd>
                      </div>
                      <div>
                        <dt className="label-caps">Qué diría</dt>
                        <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{d.body}</dd>
                      </div>
                    </dl>
                    {d.conversation_id ? (
                      <Link href={tabHref('conversaciones', { conversacion: d.conversation_id })} className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-accent-ink">
                        Ver la conversación
                      </Link>
                    ) : null}
                    {d.status === 'pendiente' ? (
                      <DraftActions id={d.id} to={to} />
                    ) : (
                      <p className="text-sm text-text-2">
                        {d.status === 'confirmado' ? `Enviado${typeof result?.enviados === 'number' ? ` a ${result.enviados} ${result.enviados === 1 ? 'persona' : 'personas'}` : ''}` : 'Descartado'}
                        {d.resolved_at ? ` · ${fmtDateTime(d.resolved_at)}` : ''}
                      </p>
                    )}
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// Lo que hizo -----------------------------------------------------------------------
export async function ActionsTab({ s }: { s: Session }) {
  const rows = await admin.listActions(s, { limit: 100 });
  return (
    <>
      <p className="mb-4 max-w-2xl text-[15px] text-text-2">Lo que el asistente hizo de verdad, con quién lo pidió. Lo que se puede deshacer tiene su botón.</p>
      {rows.length === 0 ? (
        <EmptyState title="El asistente no ha hecho nada todavía." />
      ) : (
        <Card>
          <ul className="divide-y divide-border">
            {rows.map((a) => {
              const what = actionLabel(a.action, a.detail);
              return (
                <li key={a.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold [overflow-wrap:anywhere]">{what}</p>
                    <p className="text-sm text-text-2">
                      Lo pidió {a.person ?? 'alguien del equipo'} · {fmtDateTime(a.created_at)}
                      {a.conversation_id ? (
                        <>
                          {' · '}
                          <Link href={tabHref('conversaciones', { conversacion: a.conversation_id })} className="font-semibold text-accent-ink underline-offset-2 hover:underline">
                            conversación
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  {a.undone_at ? <Chip tone="neutral">Deshecho · {fmtDateTime(a.undone_at)}</Chip> : a.undoable ? <UndoButton id={a.id} what={what} /> : <Chip tone="neutral">No se deshace</Chip>}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </>
  );
}

// Ajustes -----------------------------------------------------------------------
export async function ProfileTab({ s }: { s: Session }) {
  const p = await admin.getProfile(s);
  return <ProfileForm value={p} />;
}

