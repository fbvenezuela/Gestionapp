// 360 and the web's and Atención's guide (WF-C, design §4): every section and flow of the four docs is an entry of the
// index for the boss and Administración only, with its domain and its button; a web question goes to the web's entries
// and a team one keeps the team's; what people send from the web is never read (step C); the words of the app keep
// their meaning (step W); a whole flow is told as a story that goes on with «¿Sigo?». Invented data.
import { describe, it, expect } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { ROLES, TEAM_ROLES, type Role } from '@/lib/roles';
import { handleTurn } from '@/lib/assistant';
import { allEntries, bestAnswer, domainOf, entryById, entryForScreen, textFor } from '@/lib/assistant/answers/engine';
import { CASE_MARK, caseAsk } from '@/lib/assistant/case-ask';
import { WEB_NOT_YOURS } from '@/lib/assistant/local';
import { domainOfScreen, screenFor } from '@/lib/assistant/screens';
import { webExplain } from '@/lib/assistant/web-explain';
import { hasReceiptCode } from '@/lib/guides/check';
import { webFlows, webSections } from '@/lib/guides/web';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}
const ask = async (key: DemoUserKey, question: string, thread: string[] = [], screen: string | null = null) => {
  let conversationId: string | null = null;
  for (const t of thread) conversationId = (await handleTurn(sessionOf(key), { question: t, conversationId, screen }, { chain: [] })).conversationId;
  return handleTurn(sessionOf(key), { question, conversationId, screen }, { chain: [] });
};

const WEB_ROLES: Role[] = ROLES.filter((r) => !TEAM_ROLES.includes(r as never) && r !== 'admin') as Role[];
const web = () => allEntries().filter((e) => e.domain === 'web' || e.domain === 'atencion');

describe('las entradas de la guía de la web', () => {
  it('cada sección y cada flujo de los cuatro documentos tiene la suya, para el jefe y Administración y nadie más', () => {
    const list = web().filter((e) => e.kind !== 'curated');
    expect(list.length).toBeGreaterThan(500);
    for (const s of webSections().filter((x) => x.audience.length)) expect(entryById(`web:${s.id}`), s.id).toBeDefined();
    // (A section or a flow for the desk's people only, with no audience of the boss or Administración, has none.)
    for (const f of webFlows().filter((x) => x.audience.length)) expect(entryById(`webflujo:${f.id}`), f.id).toBeDefined();
    for (const f of webFlows().filter((x) => !x.audience.length)) expect(entryById(`webflujo:${f.id}`), f.id).toBeUndefined();
    for (const e of list) {
      expect(e.roles?.length, e.id).toBeGreaterThan(0);
      for (const r of e.roles ?? []) expect(['boss', 'admin'], `${e.id} ${r}`).toContain(r);
    }
    // Never a team role, never a web or attention role: those get no 360.
    for (const e of web()) for (const r of e.roles ?? []) expect([...TEAM_ROLES.filter((t) => t !== 'boss'), ...WEB_ROLES], `${e.id} ${r}`).not.toContain(r);
    // Ids are unique and found again.
    const ids = allEntries().map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of list.slice(0, 200)) expect(entryById(e.id)).toBe(e);
  });

  it('lo que dicen: sin huecos del cliente, sin códigos ni claves, sin raya larga ni nada interno', () => {
    for (const e of web()) {
      for (const role of e.roles ?? []) {
        const t = textFor(e.a, [role]);
        expect(t, e.id).not.toMatch(/\[[A-Z_]{3,}\]/);
        expect(t, e.id).not.toMatch(/\[§/);
        expect(hasReceiptCode(t), `${e.id}: ${t}`).toBe(false);
        expect(t, e.id).not.toMatch(/—|\*\*|`/);
        expect(t, e.id).not.toMatch(/\b(?:Supabase|servidor|base de datos|fase \d)\b/i);
      }
    }
    // The sections that print the demo receipts, keys or example codes: a fixed line, never their text.
    for (const id of ['comprobante', 'comprobantes-de-prueba', 'entrar-con-un-toque', 'practicar']) {
      const e = entryById(`web:${id}`);
      if (e) expect(textFor(e.a, ['boss']), id).toMatch(/no doy ni pido códigos ni claves/);
    }
  });

  it('su botón: una pantalla de «Web» o de «Atención», o su lugar en la guía; nunca una pantalla del equipo', () => {
    for (const e of web()) {
      if (!e.go) continue;
      const d = domainOfScreen(e.go);
      expect(d, `${e.id} → ${e.go}`).not.toBe('equipo');
      const path = e.go.split(/[?#]/)[0];
      if (path.startsWith('/admin/')) expect(screenFor(path)?.href, `${e.id} → ${e.go}`).toBe(path);
    }
  });

  it('«¿qué es esto?» en cada pantalla de «Web» y de «Atención» que abre el jefe tiene su sección', () => {
    for (const href of ['/admin/web', '/admin/web/por-aprobar', '/admin/web/biblioteca', '/admin/web/ajustes', '/admin/web/redirecciones', '/admin/atencion', '/admin/atencion/mapa', '/admin/atencion/estadisticas', '/admin/atencion/areas']) {
      const e = entryForScreen(href, ['boss']);
      expect(e?.domain, href).not.toBe('equipo');
      expect(e, href).toBeDefined();
    }
  });
});

describe('el dominio de la pregunta', () => {
  it('la web, Atención o ninguno (lo del equipo, como antes)', () => {
    const rows: [string, string | null, 'web' | 'atencion' | null][] = [
      ['¿cómo publico una noticia en la web?', null, 'web'],
      ['¿qué es una redirección?', null, 'web'],
      ['¿cómo se atiende una denuncia?', null, 'atencion'],
      ['¿quién ve el contacto de una persona en un caso?', null, 'atencion'],
      ['¿dónde están las cifras de atención?', null, 'atencion'],
      ['¿qué hago en el caso de que no me llegue el código?', null, null],
      ['¿cómo apruebo una pieza?', null, null],
      ['¿qué es el feed?', null, null],
      ['¿qué es esto?', '/admin/web/redirecciones', 'web'],
      ['¿cómo apruebo una pieza?', '/admin/web', null],
    ];
    for (const [q, screen, want] of rows) expect(domainOf(q, screen), q).toBe(want);
  });

  it('una pregunta de la web va a la guía de la web; la del equipo se queda con la del equipo', () => {
    expect(bestAnswer('¿cómo publico una noticia en la web?', { roles: ['boss'] })?.entry.domain).toBe('web');
    expect(bestAnswer('¿qué es una redirección?', { roles: ['boss'] })?.entry.domain).toBe('web');
    expect(bestAnswer('¿dónde está la biblioteca?', { roles: ['boss'] })?.entry.domain ?? 'equipo').toBe('equipo');
    expect(bestAnswer('¿cómo funciona el semáforo?', { roles: ['social'] })?.text).toMatch(/verde.*amarillo.*rojo/);
    // A word of «Palabras de la app» keeps its meaning before a section of the web's guide with the same title.
    expect(bestAnswer('¿qué es programar?', { roles: ['boss'] })?.entry.id).toBe('palabra:programar');
  });
});

describe('lo que manda la gente por la web (paso C)', () => {
  it('qué pide cada pregunta: el contenido, la persona, las cifras, la lista o un código; lo demás, la guía', () => {
    const rows: [string, ReturnType<typeof caseAsk>][] = [
      ['¿Qué pidió la señora del sector centro en su solicitud?', 'content'],
      ['léeme la última denuncia', 'content'],
      ['¿qué fotos mandó la persona del derrumbe?', 'content'],
      ['¿Qué nota interna le pusieron al caso AC-2026-K7QM2H?', 'content'],
      ['dame el teléfono de quien mandó el reporte de la luz', 'person'],
      ['¿quién hizo la denuncia del hueco?', 'person'],
      ['¿cuántas solicitudes vencidas hay?', 'count'],
      ['expórtame la lista de solicitudes con los teléfonos', 'export'],
      ['pásame la clave del comprobante de prueba', 'code'],
      ['la señora que mandó la solicitud perdió su clave, ¿me la recuperas?', 'code'],
      ['¿quién ve el contacto de la persona?', null],
      ['¿cómo se atiende una denuncia?', null],
      ['¿qué es una denuncia?', null],
      ['¿qué hago en caso de que no me llegue el código?', null],
      ['¿qué fotos mandó la persona de Grabación?', null],
      ['¿quién pidió cambios en la pieza del puente?', null],
      ['¿cómo recupero mi clave?', null],
    ];
    for (const [q, want] of rows) expect(caseAsk(q), q).toBe(want);
  });

  it('la línea fija para cada rol, guardada solo como marca, sin pasar por ningún modelo', async () => {
    const r = await ask('boss', '¿Qué pidió la señora del sector centro en su solicitud?');
    expect(r.model).toBe('local');
    expect(r.answer).toMatch(/^No leo las solicitudes, las denuncias ni los datos de la gente/);
    expect(r.goTo?.href).toBe('/admin/atencion');
    const team = await ask('social', 'que dice la gente en atención ciudadana');
    expect(team.answer).toMatch(/Atención no está en tu menú/);
    expect(team.goTo ?? null).toBeNull();
    expect(CASE_MARK).toBe('[pregunta sobre un caso]');
  });
});

describe('la web para quien no la tiene en su menú (paso D2) y las palabras de la app (paso W)', () => {
  it('a un rol del equipo: de quién es, sin pasos ni botón de la web', async () => {
    const r = await ask('social', 'como subo una noticia a la web');
    expect(r.answer).toBe(WEB_NOT_YOURS);
    expect(r.goTo ?? null).toBeNull();
  });

  it('«¿qué significa 9:16?» es la palabra; con la hora de un evento al lado, la negativa de la agenda', async () => {
    expect((await ask('camera', '¿qué significa 9:16?')).answer).toMatch(/^Números y medidas: .*9:16 es vertical/);
    expect((await ask('camera', '¿a qué hora es la jornada de salud? ¿a las 9:16?')).answer).toMatch(/no lo manejo|no la tengo/);
  });
});

describe('explicar un tema de la web y contar un flujo', () => {
  it('«no entendí» de una sección de la web: más fácil, con su botón; «dame un ejemplo»: el suyo o la guía', async () => {
    const e = entryById('web:redirecciones')!;
    expect(webExplain('simpler', e, { roles: ['boss'] })?.text).toMatch(/La guía lo explica con calma|^[A-ZÁÉÍÓÚ]/);
    expect(webExplain('example', e, { roles: ['boss'] })?.text).toBeTruthy();
    // A team topic is not the web's to explain; a role that does not have it, neither.
    expect(webExplain('simpler', 'palabra:feed', { roles: ['boss'] })).toBeNull();
    expect(webExplain('simpler', e, { roles: ['social'] })).toBeNull();
    const r = await ask('boss', 'no entendí', ['para que sirven las redirecciones de la web']);
    expect(r.answer).toMatch(/dirección vieja/);
  });

  it('un flujo contado: hasta cuatro pasos y «¿Sigo?»; un «sí» sigue donde quedó', async () => {
    const story = entryById('flujo:mes-redes')!;
    expect(story.kind).toBe('flowStory');
    expect(textFor(story.a, ['boss'])).toMatch(/¿Sigo\?$/);
    expect(story.cursor).toBeGreaterThan(0);
    const first = await ask('boss', 'cual es el flujo del mes de redes');
    expect(first.answer).toMatch(/^El mes de Redes:.*¿Sigo\?$/);
    const next = await ask('boss', 'sí', ['cual es el flujo del mes de redes']);
    expect(next.answer).not.toBe(first.answer);
    expect(next.answer).toMatch(/^\d\) /);
  });
});
