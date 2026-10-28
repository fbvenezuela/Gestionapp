'use client';

import { useId, useState } from 'react';
import { FlaskConical, Plus } from 'lucide-react';
import { testAssistantScripts, toggleAssistantScript } from '@/lib/actions/assistant';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Field, Select, Textarea } from '@/components/ui/field';
import { EmptyState } from '@/components/ui/page';
import { ORIGIN_LABEL, TEAM_ROLE_CHOICES, correctionDraft, rolesText } from '@/components/assistant/panel-core';
import { ScriptEditor, type ScriptValue } from './editors';

export type ScriptItem = ScriptValue & { id: string; origin: string; timesUsed: number; lastUsed: string | null };
type Picked = { id: string; key: string | null; topic: string; points: number; always: boolean };

const EMPTY: ScriptValue = { topic: '', triggers: [], script: 'Persona: \n[ASISTENTE]: ', notes: '', always: false, roles: [], active: true };

/** «El probador»: which scripts a question would bring, without spending a turn or counting usage. */
function Tester({ onCreate }: { onCreate: (question: string) => void }) {
  const { run, pending } = useAction();
  const id = useId();
  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [result, setResult] = useState<{ question: string; picked: Picked[] } | null>(null);
  return (
    <Card className="mb-4">
      <CardHeader title="Probador" subtitle="Escribe lo que preguntaría alguien y mira qué guiones usaría. No gasta turnos ni cuenta usos." />
      <CardBody>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const question = q.trim();
            if (!question) return;
            void run(() => testAssistantScripts({ question, role: role || null }), {
              refresh: false,
              onOk: (r) => r.ok && setResult({ question, picked: (r.data as Picked[]) ?? [] }),
            });
          }}
        >
          <Field label="La pregunta" htmlFor={`${id}-q`}>
            <Textarea id={`${id}-q`} rows={2} maxLength={1500} value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <Field label="Quién pregunta" htmlFor={`${id}-r`}>
            <Select id={`${id}-r`} value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Cualquier rol del equipo</option>
              {TEAM_ROLE_CHOICES.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary" disabled={pending || !q.trim()} className="sm:w-fit">
            <FlaskConical className="h-4 w-4" aria-hidden /> {pending ? 'Probando…' : 'Probar'}
          </Button>
        </form>
        {result ? (
          <div className="mt-4 border-t border-border pt-3" role="status">
            {result.picked.filter((p) => !p.always).length ? (
              <>
                <p className="text-sm font-semibold">Usaría estos guiones:</p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {result.picked.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center gap-2 text-[15px]">
                      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{p.topic}</span>
                      {p.always ? <Chip tone="neutral">Siempre</Chip> : <Chip tone="accent">{p.points} {p.points === 1 ? 'punto' : 'puntos'}</Chip>}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-[15px]">Ningún guion le toca: esa pregunta merece uno.</p>
                <Button variant="secondary" className="sm:w-fit" onClick={() => onCreate(result.question)}>
                  <Plus className="h-4 w-4" aria-hidden /> Crear un guion con esta pregunta
                </Button>
              </div>
            )}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function ScriptBoard({ rows }: { rows: ScriptItem[] }) {
  const { run, pending } = useAction();
  const [editing, setEditing] = useState<{ value: ScriptValue; n: number } | null>(null);
  const open = (value: ScriptValue) => setEditing({ value, n: (editing?.n ?? 0) + 1 });
  return (
    <>
      <Tester onCreate={(question) => open({ ...EMPTY, ...correctionDraft(question) })} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Button onClick={() => open(EMPTY)}>
          <Plus className="h-4 w-4" aria-hidden /> Nuevo guion
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No hay guiones con ese filtro." />
      ) : (
        <Card solid>
          <ul className="divide-y divide-border">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={`min-w-0 flex-1 font-semibold [overflow-wrap:anywhere] ${s.active ? '' : 'text-text-2 line-through'}`}>{s.topic}</h3>
                  <Chip tone={s.origin === 'fabrica' ? 'info' : 'accent'}>{ORIGIN_LABEL[s.origin] ?? s.origin}</Chip>
                  {s.always ? <Chip tone="warn">Siempre</Chip> : null}
                  {!s.active ? <Chip tone="neutral">Apagado</Chip> : null}
                </div>
                <p className="text-sm text-text-2">
                  Usado {s.timesUsed} {s.timesUsed === 1 ? 'vez' : 'veces'}
                  {s.lastUsed ? ` · la última, ${s.lastUsed}` : ''} · {rolesText(s.roles)}
                </p>
                {s.triggers.length ? <p className="line-clamp-2 text-sm text-text-2 [overflow-wrap:anywhere]">Disparadores: {s.triggers.join(' · ')}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => open(s)}>
                    Editar<span className="sr-only"> «{s.topic}»</span>
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => toggleAssistantScript({ id: s.id, active: !s.active }), { success: s.active ? 'Guion apagado: deja de influir ya.' : 'Guion encendido.' })}
                  >
                    {s.active ? 'Apagar' : 'Encender'}
                    <span className="sr-only"> «{s.topic}»</span>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {editing ? <ScriptEditor key={editing.n} open onOpenChange={(o) => !o && setEditing(null)} initial={editing.value} /> : null}
    </>
  );
}
