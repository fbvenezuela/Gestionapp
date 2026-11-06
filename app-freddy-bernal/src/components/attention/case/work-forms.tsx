'use client';

import { useId, useState } from 'react';
import { Eye, UserCheck } from 'lucide-react';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import {
  addRequestMessage,
  assignRequest,
  changeRequestState,
  eraseContact,
  reclassifyRequest,
  revealContact,
  setRequestDue,
  setRequestPriority,
  type RevealedContact,
} from '@/lib/actions/attention';
import {
  REQUEST_PRIORITIES,
  REQUEST_PRIORITY_LABEL,
  REQUEST_STATE_LABEL,
  REQUEST_TYPES,
  REQUEST_TYPE_LABEL,
  canMove,
  nextStates,
  reasonLabel,
  type RequestPriority,
  type RequestState,
  type RequestType,
} from '@/lib/domain/attention';
import { CONTACT_CHANNEL_LABEL, type ContactChannel } from '@/lib/participation/input';

// The forms of a case that the people who work it use (design §5). Each one calls its server action, which runs as the
// person and calls the database's function: the screen only offers what the state machine allows and says when a
// reason is needed, the database decides.

const sectionHint = 'text-sm text-text-2';

// --- The contact ----------------------------------------------------------------------------------------------------------

export function ContactReveal({ id, anonymous, canErase }: { id: string; anonymous: boolean; canErase: boolean }) {
  const { run, pending } = useAction();
  const [contact, setContact] = useState<RevealedContact | undefined>(undefined);
  const [reason, setReason] = useState('');
  const reasonId = useId();
  if (anonymous) return <p className={sectionHint}>La envió como anónima: no dejó contacto. Sigue el caso con su código.</p>;
  return (
    <div className="flex flex-col gap-3">
      {contact === undefined ? (
        <>
          <p className={sectionHint}>El contacto está cifrado. Al verlo queda registrado quién lo miró y cuándo.</p>
          <Button
            type="button"
            variant="secondary"
            className="w-fit"
            disabled={pending}
            onClick={() => run(() => revealContact({ id }), { refresh: false, onOk: (r) => setContact((r as { data?: RevealedContact }).data ?? null) })}
          >
            <Eye className="h-4 w-4" aria-hidden /> Ver contacto
          </Button>
        </>
      ) : contact === null ? (
        <p className={sectionHint} role="status">No dejó contacto (o se borró a su pedido).</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[15px]" role="status">
          <dt className="font-semibold">Nombre</dt>
          <dd className="[overflow-wrap:anywhere]">{contact.name ?? '—'}</dd>
          <dt className="font-semibold">Correo</dt>
          <dd className="[overflow-wrap:anywhere]">{contact.email ?? '—'}</dd>
          <dt className="font-semibold">Teléfono</dt>
          <dd className="[overflow-wrap:anywhere]">{contact.phone ?? '—'}</dd>
          <dt className="font-semibold">Prefiere</dt>
          <dd>{CONTACT_CHANNEL_LABEL[contact.preferredChannel as ContactChannel] ?? '—'}</dd>
        </dl>
      )}
      {canErase ? (
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent-ink">La persona pidió borrar su contacto</summary>
          <form
            className="mt-2 flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => eraseContact({ id, reason }), { success: 'Contacto borrado. El caso sigue.', onOk: () => setContact(null) });
            }}
          >
            <Field label="Motivo" htmlFor={reasonId} hint="Queda en el historial; el contacto no se puede recuperar.">
              <Textarea id={reasonId} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={2000} rows={2} />
            </Field>
            <Button type="submit" variant="danger" className="w-fit" disabled={pending}>Borrar el contacto</Button>
          </form>
        </details>
      ) : null}
    </div>
  );
}

// --- State ------------------------------------------------------------------------------------------------------------------

export function StateForm({ id, state }: { id: string; state: RequestState }) {
  const { run, pending } = useAction();
  const options = nextStates(state);
  const [to, setTo] = useState<RequestState | ''>('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const ids = { to: useId(), reason: useId(), note: useId() };
  const chosen = options.find((o) => o.state === to);
  if (!options.length) return <p className={sectionHint}>Desde «{REQUEST_STATE_LABEL[state]}» no hay a dónde pasar.</p>;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!to) return;
        run(() => changeRequestState({ id, state: to, reason, note }), {
          onOk: () => {
            setTo('');
            setReason('');
            setNote('');
          },
        });
      }}
    >
      <Field label="Pasar a" htmlFor={ids.to}>
        <Select id={ids.to} value={to} onChange={(e) => setTo(e.target.value as RequestState)} required>
          <option value="" disabled>Elige el estado</option>
          {options.map((o) => (
            <option key={o.state} value={o.state}>{o.label}{o.needsReason ? ' (con motivo)' : ''}</option>
          ))}
        </Select>
      </Field>
      {chosen?.needsReason && !chosen.needsNote ? (
        <Field label={reasonLabel(state, chosen.state)} htmlFor={ids.reason} hint="Es interno: la persona no lo ve.">
          <Textarea id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={2000} rows={3} />
        </Field>
      ) : null}
      {chosen ? (
        <Field
          label={chosen.needsNote ? 'Qué información necesitas (lo lee la persona)' : 'Mensaje para la persona (opcional)'}
          htmlFor={ids.note}
          hint="Lo ve en su consulta; si dejó un correo, le llega un aviso sin el texto."
        >
          <Textarea id={ids.note} value={note} onChange={(e) => setNote(e.target.value)} required={chosen.needsNote} maxLength={4000} rows={3} />
        </Field>
      ) : null}
      <Button type="submit" className="w-fit" disabled={pending || !to}>{pending ? 'Guardando…' : 'Cambiar el estado'}</Button>
    </form>
  );
}

// --- Area and responsible ----------------------------------------------------------------------------------------------------

export type StaffChoice = { id: string; name: string; coordinator: boolean; complaints: boolean; reports: boolean; areaIds: string[] };

export function AssignForm({
  id, type, areaId, assigneeId, areas, staff, canSteer, me,
}: {
  id: string; type: RequestType; areaId: string | null; assigneeId: string | null; areas: { id: string; name: string; active: boolean }[];
  staff: StaffChoice[]; canSteer: boolean; me: string;
}) {
  const { run, pending } = useAction();
  const denuncia = type === 'denuncia';
  const [area, setArea] = useState(areaId ?? '');
  const [person, setPerson] = useState(assigneeId ?? '');
  const [reason, setReason] = useState('');
  const ids = { area: useId(), person: useId(), reason: useId() };
  // Who can take it: a denuncia, the denuncias desk or the coordination; the rest, the coordination or a responsible of
  // the chosen area (assign_request() decides again).
  const people = staff.filter((p) => (denuncia ? p.complaints || p.coordinator : p.coordinator || (p.reports && !!area && p.areaIds.includes(area))));
  const meCanTake = people.some((p) => p.id === me) && assigneeId !== me;
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => assignRequest({ id, areaId: denuncia ? areaId : area || null, assigneeId: person || null, reason }), { onOk: () => setReason('') });
      }}
    >
      {!denuncia ? (
        <Field label="Área" htmlFor={ids.area} hint={canSteer ? undefined : 'El área la cambia la coordinación.'}>
          <Select
            id={ids.area}
            value={area}
            disabled={!canSteer}
            onChange={(e) => {
              setArea(e.target.value);
              setPerson('');
            }}
          >
            <option value="">Sin área</option>
            {areas.filter((a) => a.active || a.id === areaId).map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Responsable" htmlFor={ids.person} hint={denuncia ? 'Una denuncia la atienden solo el equipo de denuncias o la coordinación.' : undefined}>
        <Select id={ids.person} value={person} onChange={(e) => setPerson(e.target.value)}>
          <option value="">Sin responsable</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.coordinator ? ' (coordinación)' : ''}</option>
          ))}
        </Select>
      </Field>
      <Field label="Motivo (opcional)" htmlFor={ids.reason} hint="Queda en el historial; la persona no lo ve.">
        <Input id={ids.reason} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>{pending ? 'Guardando…' : 'Guardar asignación'}</Button>
        {meCanTake ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(() => assignRequest({ id, areaId: denuncia ? areaId : area || areaId, assigneeId: me, reason: '' }), { success: 'Ahora el caso es tuyo.' })}
          >
            <UserCheck className="h-4 w-4" aria-hidden /> Tomar el caso
          </Button>
        ) : null}
      </div>
    </form>
  );
}

// --- Priority, due date and kind (the coordination) ---------------------------------------------------------------------------

export function PriorityDueForm({ id, priority, due }: { id: string; priority: RequestPriority; due: string | null }) {
  const { run, pending } = useAction();
  const [p, setP] = useState<RequestPriority>(priority);
  const [d, setD] = useState(due ?? '');
  const ids = { p: useId(), d: useId() };
  return (
    <div className="flex flex-col gap-4">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setRequestPriority({ id, priority: p }), { success: 'Prioridad guardada.' });
        }}
      >
        <Field label="Prioridad" htmlFor={ids.p} className="flex-1" hint="Si nadie puso la fecha a mano, la fecha comprometida la sigue.">
          <Select id={ids.p} value={p} onChange={(e) => setP(e.target.value as RequestPriority)}>
            {REQUEST_PRIORITIES.map((x) => (
              <option key={x} value={x}>{REQUEST_PRIORITY_LABEL[x]}</option>
            ))}
          </Select>
        </Field>
        <Button type="submit" variant="secondary" disabled={pending || p === priority}>Guardar prioridad</Button>
      </form>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => setRequestDue({ id, due: d || null }), { success: d ? 'Fecha comprometida guardada.' : 'Se quitó la fecha comprometida.' });
        }}
      >
        <Field label="Fecha comprometida" htmlFor={ids.d} className="flex-1" hint="Vale hasta el final de ese día.">
          <Input id={ids.d} type="date" value={d} onChange={(e) => setD(e.target.value)} />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending || d === (due ?? '')}>Guardar fecha</Button>
      </form>
    </div>
  );
}

export function ReclassifyForm({ id, type, categoryId, categories, types = REQUEST_TYPES }: { id: string; type: RequestType; categoryId: string; categories: { id: string; name: string; active: boolean }[]; types?: readonly RequestType[] }) {
  const { run, pending } = useAction();
  const [t, setT] = useState<RequestType>(type);
  const [c, setC] = useState(categoryId);
  const [reason, setReason] = useState('');
  const ids = { t: useId(), c: useId(), r: useId() };
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => reclassifyRequest({ id, type: t, categoryId: c, reason }), { success: 'Tipo y categoría corregidos.', onOk: () => setReason('') });
      }}
    >
      <Field label="Tipo" htmlFor={ids.t} hint={t === 'denuncia' && type !== 'denuncia' ? 'Si pasa a denuncia, pierde la ubicación exacta y sale del área: la ven solo denuncias y la coordinación.' : undefined}>
        <Select id={ids.t} value={t} onChange={(e) => setT(e.target.value as RequestType)}>
          {types.map((x) => (
            <option key={x} value={x}>{REQUEST_TYPE_LABEL[x]}</option>
          ))}
        </Select>
      </Field>
      <Field label="Categoría" htmlFor={ids.c}>
        <Select id={ids.c} value={c} onChange={(e) => setC(e.target.value)}>
          {categories.filter((x) => x.active || x.id === categoryId).map((x) => (
            <option key={x.id} value={x.id}>{x.name}</option>
          ))}
        </Select>
      </Field>
      <Field label="Motivo" htmlFor={ids.r}>
        <Input id={ids.r} value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={2000} />
      </Field>
      <Button type="submit" variant="secondary" className="w-fit" disabled={pending || (t === type && c === categoryId)}>Corregir</Button>
    </form>
  );
}

// --- Writing ------------------------------------------------------------------------------------------------------------------

export type TemplateChoice = { id: string; kind: 'public_reply' | 'info_request'; title: string; body: string };
type MessageKind = 'internal_note' | 'public_reply' | 'info_request';

const COMPOSER: Record<MessageKind, { label: string; field: string; hint: string; button: string }> = {
  internal_note: { label: 'Nota interna', field: 'Nota para el equipo', hint: 'Solo la ve el equipo. La persona nunca la lee.', button: 'Guardar nota interna' },
  public_reply: { label: 'Respuesta a la persona', field: 'Respuesta', hint: 'La lee la persona en su consulta; si dejó un correo, le llega un aviso (sin el texto).', button: 'Enviar respuesta' },
  info_request: { label: 'Pedir más información', field: 'Qué información necesitas', hint: 'El caso pasa a «Requiere información» hasta que la persona responda desde su consulta.', button: 'Pedir la información' },
};

export function Composer({ id, state, templates, merged }: { id: string; state: RequestState; templates: TemplateChoice[]; merged: boolean }) {
  const { run, pending } = useAction();
  const [kind, setKind] = useState<MessageKind>('internal_note');
  const [body, setBody] = useState('');
  const ids = { body: useId(), tpl: useId(), legend: useId() };
  const canAsk = canMove(state, 'requiere_informacion') && !merged;
  const list = templates.filter((t) => t.kind === kind);
  const c = COMPOSER[kind];
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => addRequestMessage({ id, kind, body }), { onOk: () => setBody('') });
      }}
    >
      <fieldset className="flex flex-col gap-1" aria-describedby={ids.legend}>
        <legend className="mb-1 text-sm font-semibold">Qué vas a escribir</legend>
        {(['internal_note', 'public_reply', 'info_request'] as const).map((k) => {
          const off = (k !== 'internal_note' && merged) || (k === 'info_request' && !canAsk);
          return (
            <label key={k} className="flex min-h-11 items-center gap-2 text-[15px]">
              <input type="radio" name={`kind-${id}`} className="h-5 w-5 accent-accent" checked={kind === k} disabled={off} onChange={() => setKind(k)} />
              {COMPOSER[k].label}
              {off ? <span className="text-sm text-text-2">{merged ? '(se escribe desde el caso que se quedó)' : '(no desde este estado)'}</span> : null}
            </label>
          );
        })}
        <p id={ids.legend} className={sectionHint}>{c.hint}</p>
      </fieldset>
      {list.length ? (
        <Field label="Usar una respuesta guardada" htmlFor={ids.tpl}>
          <Select id={ids.tpl} value="" onChange={(e) => setBody(list.find((t) => t.id === e.target.value)?.body ?? body)}>
            <option value="">Elige una (la puedes cambiar antes de enviar)</option>
            {list.map((t) => (
              <option key={t.id} value={t.id}>{t.title}</option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label={c.field} htmlFor={ids.body}>
        <Textarea id={ids.body} value={body} onChange={(e) => setBody(e.target.value)} required maxLength={4000} rows={4} className={kind === 'internal_note' ? 'bg-warn-soft' : undefined} />
      </Field>
      <Button type="submit" variant={kind === 'internal_note' ? 'secondary' : 'primary'} className="w-fit" disabled={pending || !body.trim()}>
        {pending ? 'Guardando…' : c.button}
      </Button>
    </form>
  );
}
