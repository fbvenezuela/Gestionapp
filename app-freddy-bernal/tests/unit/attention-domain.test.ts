// The attention desk's rules in TypeScript (src/lib/domain/attention.ts): the state machine is the database's
// (request_transition_ok and request_state_needs_reason, checked pair by pair against PGlite with the same
// migrations), the inbox's filters survive the address, the status emails never carry the secret, what the team wrote
// or the kind of request, the overdue notices name only the code, and each role gets the screens D-93 gives it.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createMemoryDb } from '@/lib/db/pglite';
import {
  BOARD_COLUMNS,
  REQUEST_STATES,
  REQUEST_TYPES,
  STAT_DEFINITIONS,
  TRANSITIONS,
  alertNotice,
  alertReason,
  alertRecipients,
  canMove,
  contactEmail,
  deskAccess,
  fmtHours,
  inboxQuery,
  initialsOf,
  needsReason,
  nextStates,
  parseInboxFilters,
  quickMoves,
  referenceOf,
  referencePrefix,
  statusEmail,
  statusEmailRoles,
  typesFor,
  type DeskPerson,
} from '@/lib/domain/attention';

let db: PGlite;
beforeAll(async () => {
  db = (await createMemoryDb()).db;
}, 60_000);
afterAll(async () => {
  await db.close();
});

describe('la máquina de estados es la de la base', () => {
  it('cada par (de, a): se puede pasar y pide motivo exactamente donde la base lo dice', async () => {
    const { rows } = await db.query<{ f: string; t: string; ok: boolean; reason: boolean }>(
      `select f, t, public.request_transition_ok(f, t) as ok, public.request_state_needs_reason(f, t) as reason
         from unnest($1::text[]) f cross join unnest($1::text[]) t`,
      [[...REQUEST_STATES]],
    );
    expect(rows).toHaveLength(REQUEST_STATES.length ** 2);
    for (const r of rows) {
      const [from, to] = [r.f as (typeof REQUEST_STATES)[number], r.t as (typeof REQUEST_STATES)[number]];
      expect(canMove(from, to), `${from} → ${to}`).toBe(r.ok);
      if (r.ok) expect(needsReason(from, to), `motivo ${from} → ${to}`).toBe(r.reason);
    }
  });

  it('lo que ofrece la pantalla: reabrir dice «Reabrir», «requiere información» pide el mensaje para la persona', () => {
    expect(nextStates('cerrado')).toEqual([{ state: 'en_revision', label: 'Reabrir: En revisión', needsReason: true, reopen: true, needsNote: false }]);
    expect(nextStates('en_atencion').find((n) => n.state === 'requiere_informacion')).toMatchObject({ needsNote: true, needsReason: true });
    expect(nextStates('en_atencion').find((n) => n.state === 'resuelto')).toMatchObject({ needsReason: true, reopen: false });
    for (const s of REQUEST_STATES) for (const n of nextStates(s)) expect(TRANSITIONS[s]).toContain(n.state);
  });

  it('el tablero mueve de un toque solo el paso de siempre, y solo si no pide motivo', () => {
    expect(quickMoves('recibido').map((n) => n.state)).toEqual(['en_revision']);
    expect(quickMoves('asignado').map((n) => n.state)).toEqual(['en_atencion']);
    expect(quickMoves('en_atencion')).toEqual([]);
    expect(quickMoves('resuelto')).toEqual([]);
    expect(quickMoves('cerrado')).toEqual([]);
    for (const s of BOARD_COLUMNS) for (const n of quickMoves(s)) expect(n.needsReason || n.needsNote, `${s} → ${n.state}`).toBe(false);
  });
});

describe('los filtros de la bandeja van en la dirección', () => {
  it('se leen, se limpian y vuelven iguales (sin la página 1 ni la vista de lista)', () => {
    const area = '0b1c2d3e-4f50-4a6b-8c7d-8e9fa0b1c2d3';
    const f = parseInboxFilters({ q: '  AC-2026-K7QM2H ', estado: 'en_atencion', tipo: 'denuncia', area, responsable: 'yo', desde: '2026-11-30', hasta: '2026-11-01', vencidas: '1', pagina: '3', vista: 'tablero' });
    expect(f).toMatchObject({ q: 'AC-2026-K7QM2H', state: 'en_atencion', type: 'denuncia', area, assignee: 'me', from: '2026-11-01', to: '2026-11-30', overdue: true, page: 3, view: 'tablero' });
    expect(parseInboxFilters(Object.fromEntries(new URLSearchParams(inboxQuery(f).slice(1))))).toEqual(f);
    expect(inboxQuery(f, { page: 1, view: 'lista' })).not.toMatch(/pagina|vista/);
  });

  it('lo que no es válido se ignora: estados inventados, ids que no son uuid, fechas imposibles, páginas negativas', () => {
    const f = parseInboxFilters({ estado: 'borrado', tipo: 'queja', area: "1' or '1'='1", responsable: 'x', desde: '2026-13-40', pagina: '-4', categoria: 'agua' });
    expect(f).toMatchObject({ state: null, type: null, area: null, assignee: null, from: null, page: 1, categoryId: null });
    expect(parseInboxFilters({ area: 'ninguna', responsable: 'nadie' })).toMatchObject({ area: 'none', assignee: 'none' });
  });

  it('un código se busca escrito como sea; un pedazo de código, por cómo empieza', () => {
    expect(referenceOf('ac 2026 k7qm2h')).toBe('AC-2026-K7QM2H');
    expect(referenceOf('AC-2O26-K7QM2H')).toBe('AC-2026-K7QM2H');
    expect(referenceOf('hueco en la avenida')).toBeNull();
    expect(referencePrefix('ac-2026-k7')).toBe('AC-2026-K7');
    expect(referencePrefix('AC-2026')).toBeNull();
    expect(referencePrefix('agua')).toBeNull();
  });
});

describe('los correos de estado a la persona', () => {
  const ALL = ['state', 'reply', 'info_request', 'merged'] as const;
  it('dicen qué pasó y dónde leerlo, nunca la clave, el tipo de solicitud ni lo que escribió el equipo', () => {
    for (const kind of ALL) {
      for (const role of ['owner', 'supporter', 'duplicate'] as const) {
        const e = statusEmail(kind, { reference: 'AC-2026-K7QM2H', state: 'resuelto', role });
        const text = `${e.subject}\n${e.title}\n${e.body}`;
        expect(text, `${kind} ${role}`).toContain('AC-2026-K7QM2H');
        expect(text).toContain('Consultar mi solicitud');
        expect(text).toMatch(/la clave no va en este correo/);
        expect(text).not.toMatch(/denuncia|petici[oó]n|acotaci[oó]n|sugerencia|reconocimiento|nota interna/i);
        // Only who joined a report reads that word (they joined a «reporte»; nobody else learns the kind).
        if (role !== 'supporter') expect(text).not.toMatch(/reporte/i);
        expect(text).toMatch(/no es un servicio de emergencias/);
      }
    }
    expect(statusEmail('state', { reference: 'AC-2026-K7QM2H', state: 'en_atencion' }).subject).toBe('Tu solicitud AC-2026-K7QM2H: En atención');
    expect(statusEmail('state', { reference: 'AC-2026-AAAAAA', state: 'resuelto', role: 'supporter' }).body).toMatch(/^El reporte al que te sumaste \(tu código: AC-2026-AAAAAA\)/);
  });

  it('una respuesta o un pedido de información, solo a quien la envió; un cambio de estado, a todos los que la siguen', () => {
    expect(statusEmailRoles('reply')).toEqual(['owner']);
    expect(statusEmailRoles('info_request')).toEqual(['owner']);
    expect(statusEmailRoles('merged')).toEqual(['owner']);
    expect(statusEmailRoles('state')).toEqual(['owner', 'supporter', 'duplicate']);
  });

  it('solo si dejó un correo y no pidió «Que no me contacten»', () => {
    expect(contactEmail({ email: ' ana@demo.test ', preferredChannel: 'email' })).toBe('ana@demo.test');
    expect(contactEmail({ email: 'ana@demo.test', preferredChannel: 'whatsapp' })).toBe('ana@demo.test');
    expect(contactEmail({ email: 'ana@demo.test', preferredChannel: 'none' })).toBeNull();
    expect(contactEmail({ email: null, preferredChannel: 'email' })).toBeNull();
  });
});

describe('los avisos de casos vencidos o quietos', () => {
  const now = new Date('2026-11-06T15:00:00Z');
  const days = (n: number) => new Date(now.getTime() - n * 86_400_000);
  it('vencido si pasó la fecha comprometida; quieto si no se movió en N días; nada si ya terminó', () => {
    expect(alertReason({ state: 'en_atencion', dueAt: days(1), lastActivity: now }, now, 5)).toBe('overdue');
    expect(alertReason({ state: 'asignado', dueAt: null, lastActivity: days(5) }, now, 5)).toBe('stale');
    expect(alertReason({ state: 'asignado', dueAt: null, lastActivity: days(4) }, now, 5)).toBeNull();
    for (const state of ['resuelto', 'cerrado', 'no_procede'] as const) expect(alertReason({ state, dueAt: days(9), lastActivity: days(30) }, now, 5), state).toBeNull();
  });

  const staff: DeskPerson[] = [
    { id: 'c1', coordinator: true, complaints: false, reports: false, areaIds: [] },
    { id: 'c2', coordinator: true, complaints: false, reports: false, areaIds: [] },
    { id: 'd1', coordinator: false, complaints: true, reports: false, areaIds: [] },
    { id: 'a1', coordinator: false, complaints: false, reports: true, areaIds: ['A'] },
    { id: 'a2', coordinator: false, complaints: false, reports: true, areaIds: ['A'] },
    { id: 'b1', coordinator: false, complaints: false, reports: true, areaIds: ['B'] },
  ];
  it('le llega a la coordinación y a su responsable; sin responsable, a su área; una denuncia, a denuncias', () => {
    expect(alertRecipients({ type: 'reporte', assigneeId: 'a1', areaId: 'A' }, staff).sort()).toEqual(['a1', 'c1', 'c2']);
    expect(alertRecipients({ type: 'reporte', assigneeId: null, areaId: 'A' }, staff).sort()).toEqual(['a1', 'a2', 'c1', 'c2']);
    expect(alertRecipients({ type: 'reporte', assigneeId: null, areaId: null }, staff).sort()).toEqual(['c1', 'c2']);
    expect(alertRecipients({ type: 'denuncia', assigneeId: null, areaId: null }, staff).sort()).toEqual(['c1', 'c2', 'd1']);
    // The person it is assigned to works it even from another area (can_work_request); someone who lost the role is not
    // «its responsible» any more: the area hears instead.
    expect(alertRecipients({ type: 'reporte', assigneeId: 'b1', areaId: 'A' }, staff).sort()).toEqual(['b1', 'c1', 'c2']);
    expect(alertRecipients({ type: 'reporte', assigneeId: 'gone', areaId: 'A' }, staff).sort()).toEqual(['a1', 'a2', 'c1', 'c2']);
  });

  it('el aviso dice el código y qué pasa, nada de lo que escribió la persona', () => {
    expect(alertNotice({ reference: 'AC-2026-K7QM2H', reason: 'overdue', staleDays: 5, type: 'reporte' })).toEqual({ title: 'Solicitud vencida: AC-2026-K7QM2H', body: 'Pasó su fecha comprometida y sigue abierta.' });
    expect(alertNotice({ reference: 'AC-2026-K7QM2H', reason: 'stale', staleDays: 7, type: 'denuncia' }).title).toBe('Denuncia sin movimiento: AC-2026-K7QM2H');
  });
});

describe('cada rol con lo suyo (D-93)', () => {
  it('quién ve, atiende, exporta y arma qué', () => {
    expect(deskAccess(['attention_coordinator'])).toMatchObject({ readsCases: true, works: true, coordinator: true, stats: true, exports: true, exportsContacts: true, catalogs: false });
    expect(deskAccess(['reports_operator'])).toMatchObject({ readsCases: true, works: true, stats: false, exports: false, seesAreas: false });
    expect(deskAccess(['complaints_operator'])).toMatchObject({ readsCases: true, works: true, stats: false, exports: false });
    expect(deskAccess(['auditor'])).toMatchObject({ readsCases: true, works: false, stats: true, exports: true, exportsContacts: false, templates: false });
    expect(deskAccess(['boss'])).toMatchObject({ readsCases: true, works: false, stats: true, exports: false });
    expect(deskAccess(['admin'])).toMatchObject({ readsCases: false, works: false, catalogs: true, seesAreas: true, stats: false });
    expect(deskAccess(['writer'])).toMatchObject({ readsCases: false, works: false, catalogs: false, seesAreas: false });
  });

  it('una denuncia solo la buscan la coordinación y denuncias', () => {
    expect(typesFor(['attention_coordinator'])).toEqual([...REQUEST_TYPES]);
    expect(typesFor(['complaints_operator'])).toEqual(['denuncia']);
    for (const r of ['reports_operator', 'auditor', 'boss']) expect(typesFor([r]), r).not.toContain('denuncia');
  });
});

describe('palabras', () => {
  it('las horas como se dicen y las iniciales como las acepta «lo atendido»', () => {
    expect(fmtHours(0.25)).toBe('15 min');
    expect(fmtHours(5)).toBe('5 h');
    expect(fmtHours('36.5')).toBe('36,5 h');
    expect(fmtHours(72)).toBe('3 días');
    expect(fmtHours(null)).toBe('—');
    expect(initialsOf('María Pérez')).toBe('M. P.');
    expect(initialsOf('  josé   ramón  ')).toBe('J. R.');
    expect(initialsOf('M. P.')).toMatch(/^([A-Z]\.\s?){1,4}$/);
  });

  it('cada cifra tiene su definición escrita', () => {
    for (const [k, v] of Object.entries(STAT_DEFINITIONS)) expect(v.length, k).toBeGreaterThan(40);
  });
});
