// The suggested questions are the first thing each role sees in the window: every one of them,
// through the demo brain (no AI) on the demo database, must get an answer that fits.
import { describe, it, expect } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn } from '@/lib/assistant';
import { defaultProfile, mergeProfile, suggestedQuestions } from '@/lib/assistant/config';
import { contract } from '@/lib/assistant/text';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return {
    userId: u.id,
    email: u.email,
    name: u.name,
    roles: [...u.roles] as Role[],
    aal: 'aal2',
    mfaRequired: false,
    mfaOk: true,
    claims: { sub: u.id, aal: 'aal2', role: 'authenticated' },
    viewAs: null,
  };
}

// What each suggestion must bring: the tool it uses (if any) and words the answer must carry.
type Expect = { tool?: string; has: RegExp; not?: RegExp };
const EXPECTED: Record<Role & DemoUserKey, Record<string, Expect>> = {
  admin: {
    '¿Qué tengo pendiente?': { tool: 'mis_pendientes', has: /pendiente/ },
    '¿Cómo invito a alguien nuevo?': { has: /Equipo.*Invitar|invitaci/ },
    '¿Quién aprueba una pieza en rojo?': { has: /rojo.*jefe/ },
    'Marca mis avisos como leídos': { tool: 'marcar_avisos_leidos', has: /avisos|al día/ },
  },
  boss: {
    '¿Qué me toca aprobar?': { tool: 'mis_pendientes', has: /pendiente|aprobar/ },
    // The bulk approval, never «one by one».
    '¿Cómo apruebo todas las verdes de una vez?': { has: /verdes se aprueban todas juntas, con un toque/, not: /una por una/ },
    '¿Cómo va una pieza?': { tool: 'estado_pieza', has: /¿Cuál pieza\?/ },
    '¿Dónde veo cómo nos va?': { has: /Resultados/ },
  },
  dispatch: {
    '¿Qué fichas tengo incompletas?': { tool: 'mis_pendientes', has: /ficha|pendiente/i },
    '¿Cómo asigno a quien graba?': { has: /Quién graba/ },
    '¿Cómo marco un evento como realizado?': { has: /realizado/ },
    '¿Qué lleva una ficha técnica?': { has: /protocolo|cifras/ },
  },
  politics: {
    '¿Qué tengo pendiente?': { tool: 'mis_pendientes', has: /pendiente/ },
    '¿Qué puedo hacer en la plataforma?': { has: /eventos y avances comunitarios/ },
    '¿Quién decide si se hace un evento?': { has: /Jefe: tiene todo/ },
    '¿Qué es el doble factor?': { has: /director de política/ },
  },
  ivt: {
    '¿Qué tengo pendiente?': { tool: 'mis_pendientes', has: /pendiente/ },
    '¿Qué puedo hacer en la plataforma?': { has: /ficha de cada obra/ },
    '¿Puedo ver la agenda?': { has: /La Agenda está en el menú/ },
    '¿Qué es el doble factor?': { has: /director del IVT/ },
  },
  social: {
    '¿Qué tengo pendiente?': { tool: 'mis_pendientes', has: /pendiente/ },
    '¿Cuántos días de tweets quedan?': { tool: 'dias_de_tweets', has: /tweets/ },
    '¿A qué hora publico en TikTok?': { tool: 'mejores_horas', has: /TikTok/ },
    '¿Por qué no me deja publicar esta pieza?': { has: /aprobada|reglas/ },
  },
  camera: {
    '¿Qué tengo pendiente?': { tool: 'mis_pendientes', has: /pendiente/ },
    '¿Cómo subo el material?': { has: /Material.*casilla/ },
    '¿Qué pasa si se va la señal subiendo un video?': { has: /sigue sola/ },
    '¿Cuánto puede durar un video para TikTok?': { tool: 'reglas_de_video', has: /segundos/ },
  },
};

describe('preguntas sugeridas por rol (cerebro de demostración)', () => {
  for (const [role, cases] of Object.entries(EXPECTED) as [Role & DemoUserKey, Record<string, Expect>][]) {
    it(`${role}: cada sugerencia tiene su respuesta`, async () => {
      const shown = suggestedQuestions([role], 'el jefe');
      // A new suggestion in config/assistant/roles.json needs its line here.
      expect(shown.sort()).toEqual(Object.keys(cases).sort());
      for (const q of shown) {
        const r = await handleTurn(sessionOf(role), { question: q }, { chain: [] });
        const e = cases[q];
        expect(r.degraded, q).toBe(false);
        if (e.tool) expect(r.did.map((d) => d.tool), q).toContain(e.tool);
        expect(r.answer, q).toMatch(e.has);
        if (e.not) expect(r.answer, q).not.toMatch(e.not);
        expect(r.answer, q).not.toMatch(/no lo manejo|Eso no lo tengo claro/);
      }
    });
  }

  it('se escriben bien: «al jefe», nunca «a el jefe»', () => {
    for (const r of Object.keys(EXPECTED) as Role[]) {
      for (const q of suggestedQuestions([r], 'el jefe')) expect(q).not.toMatch(/\b[Aa] el\b|\b[Dd]e el\b/);
    }
    expect(contract('¿Cómo pido una frase a el jefe?')).toBe('¿Cómo pido una frase al jefe?');
  });
});

describe('nombre, cara y presentación (Ajustes → Asistente)', () => {
  const d = defaultProfile();

  it('sin nada guardado: lo de la configuración del cliente', () => {
    expect(mergeProfile(null)).toEqual(d);
  });

  it('cara vacía guardada = vacía (sale la inicial), no la de la configuración', () => {
    expect(mergeProfile({ name: 'Brisa', emoji: '', intro: 'Hola, soy Brisa.' })).toEqual({ name: 'Brisa', emoji: '', intro: 'Hola, soy Brisa.' });
  });

  it('presentación vacía: una neutra con el nombre de AHORA, nunca la del nombre viejo', () => {
    const p = mergeProfile({ name: 'Brisa', emoji: '', intro: '' });
    expect(p.intro).toContain('Brisa');
    expect(p.intro).not.toBe(d.intro);
    expect(p.intro).not.toContain(`Soy ${d.name},`);
    // A new name without an intro field at all: same.
    expect(mergeProfile({ name: 'Brisa' }).intro).toContain('Brisa');
    expect(mergeProfile({ name: 'Brisa' }).emoji).toBe(d.emoji); // never saved: the default face
  });
});
