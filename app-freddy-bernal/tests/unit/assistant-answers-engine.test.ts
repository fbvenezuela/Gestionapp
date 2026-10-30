// 360's answer index (D-89, src/lib/assistant/answers/engine.ts): how a question is read (shorthand, dictation, verb
// forms), what the index is made of (the guides, «Para todos», the flows, administración's guide and the curated
// answers), how an entry is chosen (both ways, rare words, labels, the screen, «¿quién…?», a follow-up), the text per
// role, that no answer carries a date, a time or a phone, and that it stays fast. Pure: no database.
import { describe, it, expect } from 'vitest';
import type { Role } from '@/lib/roles';
import { concreteDateTime, hasPhone } from '@/lib/guides/check';
import { NO_MESSAGES_LINE } from '@/lib/guides/shared';
import { STRONG, allEntries, entryForScreen, findAnswers, knownLabels, readable, rootOf, scoreFicha, stepsAnswer, textFor, tokens } from '@/lib/assistant/answers/engine';

const top = (q: string, roles: Role[], o: { screen?: string; extra?: string } = {}) => findAnswers(q, { roles, ...o })[0];

describe('cómo lee una pregunta', () => {
  it('las abreviaturas, lo dictado y lo que se dice de otra forma', () => {
    expect(readable('q hago pa aprobar las verdes d un toque')).toBe('que hago para aprobar las verdes de un toque');
    expect(readable('xq no me llega el msj al cel')).toBe('por que no me llega el mensaje al telefono');
    expect(readable('dnd veo lo q dijo el gobernador')).toBe('donde veo lo que dijo el jefe');
    expect(readable('cuantos caracteres en x')).toBe('cuantos caracteres twitter');
    expect(readable('el camarografo y los compas')).toBe('el grabacion y los equipo');
    expect(readable('grax tb kiero saber')).toBe('gracias tambien quiero saber');
  });

  it('un verbo y sus formas son una sola raíz: apruebo/aprobar, pongo/ponerle, publiqué/publicar, subiendo/subir', () => {
    expect(rootOf('apruebo')).toBe(rootOf('aprobar'));
    expect(rootOf('pongo')).toBe(rootOf('ponerle'));
    expect(rootOf('publique')).toBe(rootOf('publicar'));
    expect(rootOf('subiendo')).toBe(rootOf('subir'));
    expect(rootOf('fotos')).toBe(rootOf('foto'));
    expect(rootOf('publicacion')).toBe(rootOf('publicar'));
    // «correo» is not «corre» (it runs), nor «corregir».
    expect(rootOf('correo')).not.toBe(rootOf('corre'));
  });

  it('las palabras que no dicen nada no cuentan, y «mi», «tus» son lo de la persona', () => {
    expect(tokens('¿y cómo es que se hace eso?')).toEqual([]);
    expect(tokens('como cambio mi nombre')).toEqual(['cambi', 'mio', 'nombr']);
  });

  it('«¿dónde?» solo, o nada que diga algo, no tiene respuesta', () => {
    expect(findAnswers('¿dónde?', { roles: ['social'] })).toEqual([]);
    expect(findAnswers('¿y eso?', { roles: ['boss'] })).toEqual([]);
  });
});

describe('las entradas', () => {
  const entries = allEntries();

  it('vienen de las guías: tareas y pasos, pantallas, lo que no se puede, preguntas, el trabajo, «Para todos», flujos y administración', () => {
    const kinds = new Set(entries.map((e) => e.kind));
    for (const k of ['task', 'step', 'screen', 'item', 'cannot', 'faq', 'job', 'never', 'with', 'day', 'topic', 'line', 'flow', 'note'] as const) expect(kinds.has(k), k).toBe(true);
    expect(entries.length).toBeGreaterThan(800);
  });

  it('cada id es único', () => {
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('ninguna respuesta trae una fecha u hora concreta ni un teléfono', () => {
    const bad: string[] = [];
    for (const e of entries) {
      const texts = typeof e.a === 'string' ? [e.a] : Object.values(e.a).filter((x): x is string => typeof x === 'string');
      for (const t of texts) if (concreteDateTime(t) || hasPhone(t)) bad.push(`${e.id}: ${t}`);
    }
    expect(bad).toEqual([]);
  });

  it('lo que un rol no puede hacer solo contesta «¿puedo…?» (lleva may)', () => {
    for (const e of entries.filter((x) => x.kind === 'cannot')) expect(e.may, e.id).toBe(true);
    expect(entries.find((e) => e.kind === 'cannot' && e.roles?.includes('ivt'))?.a).toMatch(/^No puedes /);
  });

  it('administración no tiene Mensajes: la línea del sobre le dice que no es para ella', () => {
    const admin = entries.filter((e) => e.roles?.includes('admin') && e.source === 'shared:arriba');
    expect(admin.some((e) => e.a === NO_MESSAGES_LINE)).toBe(true);
    expect(entries.some((e) => e.source === 'shared:mensajes' && (e.roles === null || e.roles.includes('admin')))).toBe(false);
  });

  it('los textos de la pantalla con una palabra de tiempo están entre las etiquetas que se conocen', () => {
    const labels = knownLabels();
    for (const l of ['por ponerle fecha', 'hoy en la agenda', 'horas de silencio', 'vaciar este mes']) expect(labels, l).toContain(l);
  });

  it('una tarea se dice paso a paso, hasta unas 420 letras', () => {
    const t = stepsAnswer('Subir el material', ['Abre el evento.', 'Sube cada parte.']);
    expect(t).toBe('Subir el material, paso a paso: 1) Abre el evento. 2) Sube cada parte.');
    expect(stepsAnswer('X', Array.from({ length: 30 }, () => 'Un paso bastante largo para llenar el espacio.')).length).toBeLessThan(500);
  });
});

describe('cómo elige', () => {
  it('una tarea de su guía, dicha con otras formas del verbo («pongo» / «Ponerle», «ficha de obra» / «del IVT»)', () => {
    const found = findAnswers('¿como le pongo fecha a una ficha de obra?', { roles: ['boss'] }).filter((m) => !m.entry.may);
    expect(found.slice(0, 3).map((m) => m.entry.source)).toContain('boss:tasks.poner-fecha');
    expect(found[0].confidence).toBe('strong');
    expect(found[0].text).toMatch(/Ponerle fecha/);
  });

  it('cada rol con lo suyo: la misma pregunta, la guía de quien pregunta', () => {
    expect(top('como subo el material', ['camera']).entry.roles).toEqual(['camera']);
    expect(findAnswers('como subo el material', { roles: ['politics'] }).every((m) => m.entry.roles === null || m.entry.roles.includes('politics'))).toBe(true);
  });

  it('una etiqueta de la pantalla nombrada entera va primero («Hoy en la agenda»)', () => {
    const m = top('¿Qué sale en «Hoy en la agenda»?', ['camera']);
    expect(m.text).toMatch(/Hoy en la agenda/);
    expect(m.entry.screen).toBe('/hoy');
  });

  it('en la pantalla donde está la persona, su entrada suma un poco', () => {
    const q = '¿qué es «Por ponerle fecha»?';
    const here = findAnswers(q, { roles: ['dispatch'], screen: '/agenda/por-fecha' })[0];
    const away = findAnswers(q, { roles: ['dispatch'] }).find((m) => m.entry.id === here.entry.id)!;
    expect(here.entry.screen).toBe('/agenda/por-fecha');
    expect(here.score).toBeGreaterThan(away.score);
  });

  it('«¿quién…?» lo contesta un texto que nombra a alguien', () => {
    expect(top('¿Quién más puede marcar un evento como realizado?', ['camera']).text).toMatch(/jefe|despacho|Grabación/);
  });

  it('una pregunta que sigue a otra se lee con las palabras de la anterior', () => {
    const alone = top('¿y quién lo aprueba?', ['social']);
    const after = top('¿y quién lo aprueba?', ['social'], { extra: '¿Cómo mando una pieza a aprobación?' });
    expect(after.text).toMatch(/jefe/);
    expect(after.score).toBeGreaterThan(alone?.score ?? 0);
  });

  it('una sola palabra que solo sale en un texto no es una respuesta segura', () => {
    const m = top('¿qué es la receptividad?', ['social']);
    if (m.entry.q.length === 0) expect(m.score).toBeLessThan(STRONG);
  });

  it('lo que no es de la plataforma no tiene una respuesta segura', () => {
    for (const q of ['¿cuánto está el dólar hoy?', '¿quién ganó el juego de béisbol?', 'cuéntame un chiste']) {
      const m = top(q, ['social']);
      expect(m?.confidence ?? 'none', q).not.toBe('strong');
    }
  });

  it('el texto por rol: la clave del rol, si no `default`', () => {
    expect(textFor({ boss: 'Tú lo apruebas.', default: 'Lo aprueba el jefe.' }, ['boss'])).toBe('Tú lo apruebas.');
    expect(textFor({ boss: 'Tú lo apruebas.', default: 'Lo aprueba el jefe.' }, ['social'])).toBe('Lo aprueba el jefe.');
    expect(textFor('Igual para todos.', ['ivt'])).toBe('Igual para todos.');
  });

  it('una pantalla de administración dice para qué es («¿qué es esto?» en ella)', () => {
    expect(entryForScreen('/ajustes/contenido', ['admin'])?.a).toMatch(/cupo del mes/);
    expect(entryForScreen('/ajustes/contenido', ['social'])).toBeUndefined();
  });

  it('una ficha se mide en la misma escala, frase por frase', () => {
    const f = { title: 'Mi perfil: nombre, teléfono y avisos', tags: ['perfil'], body: 'En Mi perfil cambias tu nombre. Ahí también activas los avisos en este teléfono.' };
    expect(scoreFicha('como cambio mi nombre', f)).toBeGreaterThan(0.5);
    expect(scoreFicha('cuanto esta el dolar', f)).toBe(0);
  });
});

describe('rápido', () => {
  it('el índice se arma una vez y cada pregunta tarda mucho menos de 20 ms', () => {
    allEntries();
    const qs = ['¿cómo le pongo fecha a una ficha de obra?', 'q hago pa aprobar las verdes d un toque', '¿Qué sale en «Hoy en la agenda»?', 'como subo el material de la cancha que grabe ayer en la tarde con el dron y las tomas de apoyo'];
    const t0 = performance.now();
    for (let k = 0; k < 50; k++) for (const q of qs) findAnswers(q, { roles: ['boss', 'social'], screen: '/hoy' });
    const per = (performance.now() - t0) / (50 * qs.length);
    expect(per).toBeLessThan(20);
    // A long question (the window's limit is 1.500 letters) too.
    const long = 'como subo el material del evento '.repeat(45);
    const t1 = performance.now();
    findAnswers(long, { roles: ['camera'] });
    expect(performance.now() - t1).toBeLessThan(100);
  });
});
