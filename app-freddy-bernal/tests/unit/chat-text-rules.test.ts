// The app's Mensajes text rules (src/lib/domain/chat.ts) against the cases the database's copies are tested with
// (tests/unit/fixtures/chat-text-cases.ts; the SQL side: tests/rls/chat.test.ts). If a case changes here, it changes for
// both, and the migration that changes the SQL goes with it. All data here is invented.
import { describe, expect, it } from 'vitest';
import {
  CHAT_RELATIVE_ASK, CHAT_ROLE_PAIRS, CHAT_TIMECODE_ASK, CHAT_WHEN_WARN, cameraOnly, chatAgendaClear, chatTextProblem, chatTitleProblem,
  fillWord, firstConcreteDateTime, firstRelativeWhen, hasConcreteDateTime, hasMap, knowsAgenda, linkRefs, pairAllowed, previewOf,
  readerKnowsAgenda, stripRefs, stripTimecodes, timecodesIn,
} from '@/lib/domain/chat';
import { DEMO_USERS } from '@/lib/db/seed-demo';
import { ROLES, type Role } from '@/lib/roles';
import { CONCRETE_CASES, GUARD_CASES, MAP_CASES, REF_CASES, TIMECODE_CASES, UUID, chatGeneratedTexts } from './fixtures/chat-text-cases';

const rolesOf = (key: string) => [...DEMO_USERS.find((u) => u.key === key)!.roles] as Role[];
const ok = { timecodeOk: true, relativeOk: true };

describe('las reglas de texto de Mensajes (las mismas que revisa la base)', () => {
  it('fecha u hora concreta: hasConcreteDateTime()', () => {
    for (const c of CONCRETE_CASES) expect(hasConcreteDateTime(c.text), JSON.stringify(c.text)).toBe(c.concrete);
  });

  it('enlaces de mapas y coordenadas: hasMap()', () => {
    for (const c of MAP_CASES) expect(hasMap(c.text), JSON.stringify(c.text)).toBe(c.map);
  });

  it('lo que se quita antes de revisar: stripRefs() y stripTimecodes()', () => {
    for (const c of REF_CASES) expect(stripRefs(c.text), JSON.stringify(c.text)).toBe(c.out);
    for (const c of TIMECODE_CASES) expect(stripTimecodes(c.text), JSON.stringify(c.text)).toBe(c.out);
  });

  it('cada mensaje de la tabla: pasa, teléfono o fecha, y su agenda_clear', () => {
    for (const c of GUARD_CASES) {
      const roles = rolesOf(c.author);
      const p = chatTextProblem(c.text, { hidesAgenda: c.hides, authorRoles: roles, ...ok });
      const result = p === null ? 'ok' : p.kind;
      expect(result, `${c.author} ${c.hides ? 'con Redes' : 'sin Redes'}: ${c.text}`).toBe(c.result);
      if (c.result === 'ok') expect(chatAgendaClear(c.text, roles), c.text).toBe(c.agendaClear);
    }
  });

  it('los textos generados son siempre los mismos y tocan los dos lados de cada regla', () => {
    const a = chatGeneratedTexts(3000);
    expect(chatGeneratedTexts(3000)).toEqual(a);
    const counts = [
      a.filter((s) => hasConcreteDateTime(s)).length,
      a.filter((s) => hasMap(s)).length,
      a.filter((s) => stripRefs(s) !== s).length,
      a.filter((s) => stripTimecodes(s) !== s).length,
    ];
    for (const n of counts) {
      expect(n).toBeGreaterThan(100);
      expect(n).toBeLessThan(2900);
    }
  });
});

describe('chatTextProblem(): lo que el compositor dice antes de enviar', () => {
  const boss = rolesOf('boss');
  const camera = rolesOf('camera');

  it('nombra la palabra: lo concreto no va, lo relativo se pregunta (E1)', () => {
    expect(chatTextProblem('Nos vemos mañana a las 9', { hidesAgenda: true, authorRoles: boss })).toEqual({ kind: 'when', word: 'a las 9' });
    expect(chatTextProblem('el 12 de noviembre en la plaza', { hidesAgenda: true, authorRoles: boss })).toEqual({ kind: 'when', word: '12 de noviembre' });
    expect(chatTextProblem('Mira https://maps.google.com/?q=plaza', { hidesAgenda: true, authorRoles: boss })).toEqual({ kind: 'when', word: 'un enlace de mapas' });
    expect(chatTextProblem('Queda en 7.7612, -72.2245', { hidesAgenda: true, authorRoles: boss })).toEqual({ kind: 'when', word: 'unas coordenadas' });
    expect(chatTextProblem('mañana te mando la frase', { hidesAgenda: true, authorRoles: boss })).toEqual({ kind: 'relative', word: 'mañana' });
    expect(chatTextProblem('Pasado mañana lo vemos', { hidesAgenda: true, authorRoles: boss })).toEqual({ kind: 'relative', word: 'Pasado mañana' });
    expect(chatTextProblem('lo vemos el fin de semana', { hidesAgenda: true, authorRoles: boss })).toEqual({ kind: 'relative', word: 'el fin de semana' });
    expect(chatTextProblem('el lunes sale', { hidesAgenda: true, authorRoles: boss })).toEqual({ kind: 'relative', word: 'lunes' });
    expect(chatTextProblem('mañana te mando la frase', { hidesAgenda: true, authorRoles: boss, relativeOk: true })).toBeNull();
    // Where Redes and política do not read, or from who does not know the agenda: nothing to ask.
    expect(chatTextProblem('mañana a las 9', { hidesAgenda: false, authorRoles: boss })).toBeNull();
    expect(chatTextProblem('mañana a las 9', { hidesAgenda: true, authorRoles: rolesOf('social') })).toBeNull();
    expect(chatTextProblem('mañana a las 9', { hidesAgenda: true, authorRoles: rolesOf('politics') })).toBeNull();
  });

  it('Grabación: el tiempo del video se pregunta; la hora no va', () => {
    expect(chatTextProblem('en el 2:15 está la toma', { hidesAgenda: true, authorRoles: camera })).toEqual({ kind: 'timecode', word: '2:15' });
    expect(chatTextProblem('en el 2:15 está la toma', { hidesAgenda: true, authorRoles: camera, timecodeOk: true })).toBeNull();
    expect(chatTextProblem('en el 2:15 mañana', { hidesAgenda: true, authorRoles: camera, timecodeOk: true })).toEqual({ kind: 'relative', word: 'mañana' });
    expect(chatTextProblem('a las 2:15 en la escuela', { hidesAgenda: true, authorRoles: camera })).toEqual({ kind: 'when', word: 'a las 2:15' });
    // Grabación with despacho too knows the whole agenda: no time codes for it.
    expect(chatTextProblem('en el 2:15 está la toma', { hidesAgenda: true, authorRoles: ['camera', 'dispatch'] })).toEqual({ kind: 'when', word: '2:15' });
    expect(timecodesIn('del 2:15 al 3:40, a las 5:00')).toEqual(['2:15', '3:40']);
  });

  it('teléfonos para todos, y dice si el número está en un enlace', () => {
    expect(chatTextProblem('llámalo al 0414 555 12 34', { hidesAgenda: false, authorRoles: rolesOf('social') })).toEqual({ kind: 'phone', inLink: false });
    expect(chatTextProblem('https://wa.me/584145551234', { hidesAgenda: false, authorRoles: rolesOf('social') })).toEqual({ kind: 'phone', inLink: true });
    expect(chatTextProblem('https://x.com/0414-555-1234', { hidesAgenda: false, authorRoles: boss })).toEqual({ kind: 'phone', inLink: true });
    expect(chatTextProblem('Tel: 0414-555-1234', { hidesAgenda: false, authorRoles: boss })).toEqual({ kind: 'phone', inLink: false });
    expect(chatTextProblem(`Mira /eventos/${UUID} y https://x.com/redesfb/status/1849204857203948573`, { hidesAgenda: true, authorRoles: boss })).toBeNull();
  });

  it('los textos se llenan con la palabra', () => {
    expect(fillWord(CHAT_WHEN_WARN, 'a las 9')).toBe('“a las 9” no puede ir aquí');
    expect(fillWord(CHAT_RELATIVE_ASK, 'mañana')).toBe('“mañana”: ¿dice cuándo va el jefe? Si es de la agenda, no va aquí.');
    expect(fillWord(CHAT_TIMECODE_ASK, '2:15')).toBe('¿2:15 es un tiempo del video? Si es una hora, no va aquí.');
  });

  it('las piezas sueltas', () => {
    expect(firstConcreteDateTime('mañana, el 12/11 a las 3 pm')).toBe('12/11');
    expect(firstConcreteDateTime('hoy y mañana')).toBeNull();
    expect(firstRelativeWhen('esta noche o por la tarde')).toBe('esta noche');
    expect(firstRelativeWhen('la próxima semana')).toBe('la próxima semana');
    expect(firstRelativeWhen('Hoyos y Martín')).toBeNull();
  });

  it('el nombre de un grupo: el modo estricto si están Redes o política', () => {
    expect(chatTitleProblem('Obras y comunidad', { withRedesOrPolitics: true })).toBeNull();
    expect(chatTitleProblem('Lo de mañana', { withRedesOrPolitics: true })).toEqual({ kind: 'when', word: 'mañana' });
    expect(chatTitleProblem('Lo de mañana', { withRedesOrPolitics: false })).toBeNull();
    expect(chatTitleProblem('Plaza maps.google.com', { withRedesOrPolitics: true })).toEqual({ kind: 'when', word: 'un enlace de mapas' });
    expect(chatTitleProblem('Vocera 0414-555-1234', { withRedesOrPolitics: false })).toEqual({ kind: 'phone', inLink: false });
  });
});

describe('quién conoce la agenda y quién habla con quién (espejos de la base)', () => {
  it('knowsAgenda, cameraOnly y readerKnowsAgenda', () => {
    expect(knowsAgenda(['boss'])).toBe(true);
    expect(knowsAgenda(['admin'])).toBe(true);
    expect(knowsAgenda(['social'])).toBe(false);
    expect(knowsAgenda(['politics'])).toBe(false);
    expect(knowsAgenda(['politics', 'ivt'])).toBe(true);
    expect(cameraOnly(['camera'])).toBe(true);
    expect(cameraOnly(['camera', 'social'])).toBe(true);
    expect(cameraOnly(['camera', 'ivt'])).toBe(false);
    expect(readerKnowsAgenda(['camera'])).toBe(true);
    expect(readerKnowsAgenda(['camera', 'social'])).toBe(false);
    expect(readerKnowsAgenda(['politics', 'ivt'])).toBe(false);
    expect(readerKnowsAgenda(['admin'])).toBe(false);
  });

  it('las 10 parejas, en el orden del enum', () => {
    expect(CHAT_ROLE_PAIRS).toHaveLength(10);
    for (const p of CHAT_ROLE_PAIRS) expect(ROLES.indexOf(p.roleA), p.label).toBeLessThan(ROLES.indexOf(p.roleB));
    expect(CHAT_ROLE_PAIRS.map((p) => p.label)).toContain('Redes ↔ Grabación');
    expect(new Set(CHAT_ROLE_PAIRS.map((p) => `${p.roleA}:${p.roleB}`)).size).toBe(10);
  });

  it('pairAllowed: el jefe siempre, administración nunca, con dos roles gana la regla más restrictiva', () => {
    const closed = [{ roleA: 'politics' as Role, roleB: 'social' as Role, allowed: false }, { roleA: 'ivt' as Role, roleB: 'social' as Role, allowed: true }];
    expect(pairAllowed(['social'], ['politics'], [])).toBe(true);
    expect(pairAllowed(['social'], ['politics'], closed)).toBe(false);
    expect(pairAllowed(['politics'], ['social'], closed)).toBe(false);
    expect(pairAllowed(['politics', 'ivt'], ['social'], closed)).toBe(false);
    expect(pairAllowed(['ivt'], ['social'], closed)).toBe(true);
    expect(pairAllowed(['boss'], ['social'], closed)).toBe(true);
    expect(pairAllowed(['social'], ['boss'], [{ roleA: 'boss', roleB: 'social', allowed: false }])).toBe(true);
    expect(pairAllowed(['admin', 'social'], ['camera'], [])).toBe(false);
    expect(pairAllowed(['social'], [], [])).toBe(false);
    expect(pairAllowed(['social'], ['social'], closed)).toBe(true);
  });
});

describe('enlaces a la plataforma y la vista previa', () => {
  it('linkRefs: las rutas internas exactas, una vez cada una', () => {
    expect(linkRefs(`Mira /eventos/${UUID}?tab=material, /EVENTOS/${UUID.toUpperCase()}?tab=material y /aprobar/${UUID}`)).toEqual([
      { kind: 'event', id: UUID, href: `/eventos/${UUID}?tab=material` },
      { kind: 'piece', id: UUID, href: `/aprobar/${UUID}` },
    ]);
    expect(linkRefs(`/municipios/${UUID} /mensajes/${UUID}`)).toEqual([{ kind: 'chat', id: UUID, href: `/mensajes/${UUID}` }]);
  });

  it('previewOf: una línea, sin enlaces, 80 letras como mucho', () => {
    expect(previewOf(`Ya subí las tomas\n/eventos/${UUID} https://x.com/a`)).toBe('Ya subí las tomas');
    expect(previewOf(`/eventos/${UUID}`)).toBe('Un enlace');
    const long = previewOf('a'.repeat(200));
    expect(long).toHaveLength(80);
    expect(long.endsWith('…')).toBe(true);
  });
});
