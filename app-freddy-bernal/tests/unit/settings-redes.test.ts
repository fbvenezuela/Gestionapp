// Cupo y pilares (R4, D-68): the action's zod rules say the same as the database's guard_redes_settings() for every
// value below (the action answers first, in words; the database is the lock). Only administración with 2FA writes
// them, as every setting. Needs the R4 migration (guard_redes_settings): runs once WP-A is merged.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', async (orig) => ({ ...(await orig<typeof import('@/lib/auth/session')>()), requireSession: vi.fn(async () => h.session) }));

let t: TestDb;
let settings: typeof import('@/lib/actions/settings');

function as(key: DemoUserKey, mfaOk = true) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: mfaOk ? 'aal2' : 'aal1', mfaRequired: true, mfaOk,
    claims: { sub: t.ids[key], aal: mfaOk ? 'aal2' : 'aal1', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}

beforeAll(async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  settings = await import('@/lib/actions/settings');
});

/** What the database alone says (administración with 2FA writing the value directly, no zod in between). */
async function guardSays(key: string, value: unknown): Promise<boolean> {
  try {
    await t.as('admin', (sql) =>
      sql.query(
        `insert into public.app_settings (key, value, updated_by) values ($1, $2::text::jsonb, auth.uid())
         on conflict (key) do update set value = excluded.value, updated_by = auth.uid(), updated_at = now()`,
        [key, JSON.stringify(value)],
      ),
    );
    return true;
  } catch {
    return false;
  }
}

const QUOTA_TEXT = 'El cupo es un número entero de 0 a 200 por formato.';
const PILLAR_TEXT = 'Cada pilar lleva una clave única y un nombre de 1 a 40 letras.';
const pillar = (key: string, name: string, tone?: unknown) => ({ key, name, ...(tone === undefined ? {} : { tone }) });

const QUOTAS: [string, unknown, boolean][] = [
  ['el de la referencia', { reel: 12, post: 8, carousel: 4, story: 30, youtube: 4 }, true],
  ['solo algunos formatos', { post: 10 }, true],
  ['vacío', {}, true],
  ['cero y doscientos', { reel: 0, story: 200 }, true],
  ['negativo', { post: -1 }, false],
  ['más de 200', { story: 201 }, false],
  ['con decimales', { reel: 1.5 }, false],
  ['un texto', { post: '8' }, false],
  ['un formato que no tiene cupo', { tweet: 3 }, false],
  ['fin de mes (sin cupo)', { month_end: 1 }, false],
  ['nulo', { reel: null }, false],
  ['una lista', [8, 12], false],
];

const PILLARS: [string, unknown, boolean][] = [
  ['cinco pilares inventados', [pillar('obras', 'Obras que se ven', 'accent'), pillar('servicios', 'Servicios públicos', 'info'), pillar('gente', 'La gente', 'ok')], true],
  ['vacío (la configuración real)', [], true],
  ['sin color: neutro', [pillar('cultura', 'Cultura y tradición')], true],
  ['color nulo: neutro', [pillar('cultura', 'Cultura', null)], true],
  ['claves repetidas', [pillar('obras', 'Obras'), pillar('obras', 'Otras obras')], false],
  ['nombre vacío', [pillar('obras', '   ')], false],
  ['nombre de 41 letras', [pillar('obras', 'x'.repeat(41))], false],
  ['clave con mayúsculas', [pillar('Obras', 'Obras')], false],
  ['clave que empieza con guion', [pillar('-obras', 'Obras')], false],
  ['un color que no está', [pillar('obras', 'Obras', 'danger')], false],
  ['un teléfono en el nombre', [pillar('obras', 'Llama al 0414-555-0199')], false],
  ['trece pilares', Array.from({ length: 13 }, (_, i) => pillar(`p${i}`, `Pilar ${i}`)), false],
  ['no es una lista', { obras: 'Obras' }, false],
];

describe('cupo y pilares: lo que dice la acción es lo que dice la base', () => {
  for (const [key, cases] of [['redes.quotas', QUOTAS], ['redes.pillars', PILLARS]] as const) {
    for (const [name, value, ok] of cases) {
      it(`${key}: ${name} → ${ok ? 'pasa' : 'no pasa'}`, async () => {
        as('admin');
        const r = await settings.saveSetting({ key, value });
        expect(r.ok, 'la acción').toBe(ok);
        expect(await guardSays(key, value), 'la base').toBe(ok);
      });
    }
  }

  it('los mensajes son en palabras', async () => {
    as('admin');
    expect(await settings.saveSetting({ key: 'redes.quotas', value: { post: -1 } })).toEqual({ ok: false, error: QUOTA_TEXT });
    expect(await settings.saveSetting({ key: 'redes.quotas', value: { tweet: 3 } })).toEqual({ ok: false, error: QUOTA_TEXT });
    expect(await settings.saveSetting({ key: 'redes.pillars', value: [pillar('obras', 'Obras'), pillar('obras', 'Otra')] })).toEqual({ ok: false, error: PILLAR_TEXT });
  });

  it('un pilar renombrado guarda su clave; el nombre se guarda sin espacios de más', async () => {
    as('admin');
    expect(await settings.saveSetting({ key: 'redes.pillars', value: [pillar('obras', '  Obras del mes  ')] })).toMatchObject({ ok: true });
    const v = await t.system((sql) => sql.one<{ value: unknown }>(`select value from public.app_settings where key = 'redes.pillars'`));
    expect(v!.value).toEqual([{ key: 'obras', name: 'Obras del mes', tone: 'neutral' }]);
  });

  it('solo administración con doble factor (Redes y el jefe no, todavía: pregunta 6)', async () => {
    for (const [who, mfa] of [['social', true], ['boss', true], ['admin', false]] as const) {
      as(who, mfa);
      expect((await settings.saveSetting({ key: 'redes.quotas', value: { post: 9 } })).ok, `${who}${mfa ? '' : ' sin doble factor'}`).toBe(false);
    }
  });
});
