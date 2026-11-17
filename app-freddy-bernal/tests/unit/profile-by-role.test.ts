// Mi perfil said for each role (WF-C; the TRAIN labels update §7 and its review): the guide's «Qué avisos quiero» line
// and 360's copies of it name only the notices that reach that role (built from ALWAYS_NOTICES, the list the screen
// shows under the switches), and the two-factor line of «Mis datos» goes only to the roles whose screen shows it (never
// to Redes or Grabación). The guides, the answers of the index, the guide cards and two turns of 360. Invented data.
import { describe, it, expect } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { STAFF_ROLES, type Role } from '@/lib/roles';
import { ALWAYS_NOTICES, TWO_FACTOR_ROLES, alwaysNoticesFor, showsTwoFactor } from '@/lib/domain/profile-notices';
import { getClientConfig } from '@/lib/client-config';
import { guideFor } from '@/lib/guides';
import { everyoneSections } from '@/lib/guides/sections';
import { allEntries, entryById, textFor } from '@/lib/assistant/answers/engine';
import { FACTORY_KNOWLEDGE } from '@/lib/assistant/config';
import { handleTurn } from '@/lib/assistant';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}

const mine = (r: Role) => [...new Set(ALWAYS_NOTICES.filter((n) => n.roles.includes(r)).map((n) => n.label))];
const notMine = (r: Role) => [...new Set(ALWAYS_NOTICES.filter((n) => !n.roles.includes(r)).map((n) => n.label))].filter((l) => !mine(r).includes(l));
const forRole = (roles: Role[] | null, r: Role) => roles === null || roles.includes(r);
const TWO_FACTOR = /cómo está tu doble factor/;
const NO_TWO_FACTOR: Role[] = ['social', 'camera'];

describe('«Qué avisos quiero», rol por rol', () => {
  it('la guía nombra los avisos que siempre le llegan a cada rol, y ninguno de otro', () => {
    for (const r of STAFF_ROLES) {
      const perfil = everyoneSections(r).find((s) => s.screen === '/perfil')!;
      const line = perfil.youDo.find((x) => x.includes('«Qué avisos quiero»'))!;
      expect(line, r).toContain(`siempre te llegan (no se pueden apagar): ${alwaysNoticesFor([r])}.`);
      for (const l of mine(r)) expect(line, `${r}: ${l}`).toContain(l);
      for (const l of notMine(r)) expect(line, `${r}: ${l}`).not.toContain(l);
      // The old one list for everyone is gone.
      expect(line, r).not.toMatch(/por ejemplo, que te asignaron un evento/);
    }
    // Each role's guide carries its own line (the same the screen lists).
    for (const r of ['politics', 'dispatch', 'social', 'camera', 'boss', 'ivt'] as const) {
      const line = guideFor(r).sections.find((s) => s.screen === '/perfil')!.youDo.find((x) => x.includes('«Qué avisos quiero»'))!;
      expect(line, r).toContain(alwaysNoticesFor([r])!);
    }
    // Política and despacho: only an event that is cancelled (never «los cambios que el jefe pide»).
    for (const r of ['politics', 'dispatch'] as const) expect(alwaysNoticesFor([r])).toBe('un evento que se cancela');
  });

  it('360 dice lo mismo a cada rol: su respuesta, las entradas de la guía y las fichas', () => {
    const answer = entryById('curado:todo-que-avisos-quiero')!;
    for (const r of STAFF_ROLES) {
      const said = textFor(answer.a, [r]);
      for (const l of mine(r)) expect(said, `${r}: ${l}`).toContain(l);
      for (const l of notMine(r)) expect(said, `${r}: ${l}`).not.toContain(l);
      // Everything of the index that says what always reaches the person, said to this role.
      for (const e of allEntries().filter((x) => forRole(x.roles, r))) {
        const t = textFor(e.a, [r]);
        if (!/siempre te llegan/.test(t)) continue;
        for (const l of notMine(r)) expect(t, `${e.id} ${r}: ${l}`).not.toContain(l);
      }
      // The guide cards never list them (they point to the list under the switches).
      for (const k of FACTORY_KNOWLEDGE.filter((x) => forRole(x.roles as Role[] | null, r) && x.body.includes('«Qué avisos quiero»'))) {
        for (const l of notMine(r)) expect(k.body, `${k.key} ${r}: ${l}`).not.toContain(l);
      }
    }
  });
});

describe('el doble factor de «Mis datos», solo para quien lo ve en su pantalla', () => {
  it('los roles con esa línea son los de la configuración (mfaRoles)', () => {
    const cfg = getClientConfig() as { mfaRoles: string[] };
    expect([...TWO_FACTOR_ROLES].sort()).toEqual(STAFF_ROLES.filter((r) => cfg.mfaRoles.includes(r)).sort());
    for (const r of NO_TWO_FACTOR) expect(showsTwoFactor([r]), r).toBe(false);
  });

  it('a Redes y a Grabación nada les dice cómo está su doble factor: ni la guía, ni 360, ni sus fichas', () => {
    for (const r of NO_TWO_FACTOR) {
      const texts = guideFor(r).sections.flatMap((s) => [s.what, ...s.youDo, ...(s.cannot ?? [])]);
      expect(texts.filter((t) => TWO_FACTOR.test(t)), r).toEqual([]);
      const said = allEntries().filter((e) => forRole(e.roles, r)).map((e) => [e.id, textFor(e.a, [r])] as const).filter(([, t]) => TWO_FACTOR.test(t));
      expect(said, r).toEqual([]);
      const cards = FACTORY_KNOWLEDGE.filter((k) => forRole(k.roles as Role[] | null, r) && TWO_FACTOR.test(k.body)).map((k) => k.key);
      expect(cards, r).toEqual([]);
    }
  });

  it('a los demás, «Mis datos» trae su nombre y cómo está su doble factor', () => {
    for (const r of TWO_FACTOR_ROLES) {
      const line = everyoneSections(r).find((s) => s.screen === '/perfil')!.youDo[0];
      expect(line, r).toBe('En «Mis datos», tu nombre y cómo está tu doble factor.');
      expect(textFor(entryById('curado:todo-mi-perfil')!.a, [r]), r).toMatch(/«Mis datos» \(tu nombre y cómo está tu doble factor\)/);
      expect(FACTORY_KNOWLEDGE.some((k) => forRole(k.roles as Role[] | null, r) && TWO_FACTOR.test(k.body)), r).toBe(true);
    }
  });

  it('«¿qué hay en mis datos?»: con el doble factor para despacho, sin él para Redes y Grabación', async () => {
    const ask = (key: DemoUserKey) => handleTurn(sessionOf(key), { question: '¿qué hay en mis datos?' }, { chain: [] });
    for (const key of ['social', 'camera'] as const) expect((await ask(key)).answer, key).not.toMatch(/doble factor/);
    for (const key of ['dispatch', 'politics'] as const) expect((await ask(key)).answer, key).toMatch(TWO_FACTOR);
  });
});
