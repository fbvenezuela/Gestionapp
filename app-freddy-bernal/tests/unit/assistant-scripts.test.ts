// The assistant's database pieces (PGlite, same migrations as production): plain text,
// script scoring per the manual (§6), automatic fichas (§5) and the «no pisar» seed.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from '../rls/setup';
import { seedAssistant } from '@/lib/assistant/seed';
import { FACTORY_KNOWLEDGE, FACTORY_SCRIPTS } from '@/lib/assistant/config';
import type { Sql } from '@/lib/db/core';

let t: TestDb;
beforeAll(async () => {
  t = await makeTestDb();
});

type Pick = { script_key: string | null; script_topic: string; script_always: boolean; script_points: number };
const pickFor = (sql: Sql, text: string, roles = '{admin}', top = 3, count = false) =>
  sql.query<Pick>(`select * from public.assistant_scripts_for($1, $2::public.app_role[], $3, $4)`, [text, roles, top, count]);

// A clean, known set of scripts inside one transaction that is rolled back at the end.
async function withScripts<T>(rows: { topic: string; triggers: string[]; always?: boolean; roles?: string | null; used?: number }[], fn: (sql: Sql) => Promise<T>): Promise<T> {
  let out: T | undefined;
  await t
    .system(async (sql) => {
      await sql.query(`update public.assistant_scripts set active = false`);
      for (const r of rows) {
        await sql.query(
          `insert into public.assistant_scripts (topic, triggers, script, always, roles, times_used) values ($1, $2::text[], 'Persona: x\n[ASISTENTE]: y', $3, $4::public.app_role[], $5)`,
          [r.topic, `{${r.triggers.map((x) => `"${x}"`).join(',')}}`, r.always ?? false, r.roles ?? null, r.used ?? 0],
        );
      }
      out = await fn(sql);
      throw new Error('rollback');
    })
    .catch((e) => {
      if ((e as Error).message !== 'rollback') throw e;
    });
  return out as T;
}

describe('assistant_plain', () => {
  it('quita tildes, signos y mayúsculas', async () => {
    const r = await t.system((sql) => sql.one<{ p: string }>(`select public.assistant_plain('¿Cómo te LLAMAS?  ¡Ñandú!') as p`));
    expect(r!.p).toBe('como te llamas nandu');
  });
});

describe('assistant_scripts_for: la puntuación del manual', () => {
  it('3 puntos por disparador entero y 1 por palabra de 4+ letras del tema o los disparadores', async () => {
    const rows = await withScripts([{ topic: 'Quién eres', triggers: ['como te llamas', 'tu nombre'] }], (sql) => pickFor(sql, '¿Cómo te llamas?'));
    // "como te llamas" (3) + words ≥4 letters found: como (1), llamas (1) → 5.
    expect(rows).toHaveLength(1);
    expect(rows[0].script_points).toBe(5);
  });

  it('hacen falta 2 puntos: una palabra suelta no trae guiones', async () => {
    const rows = await withScripts([{ topic: 'Mejores horas', triggers: ['a que hora publico'] }], (sql) => pickFor(sql, 'tengo hora libre'));
    // Only "hora" (1 point) → not chosen.
    expect(rows).toHaveLength(0);
  });

  it('el disparador cuenta desde el inicio de una palabra (no a mitad)', async () => {
    const rows = await withScripts([{ topic: 'Saludo', triggers: ['hola'] }], (sql) => pickFor(sql, 'una cholada fría'));
    expect(rows).toHaveLength(0);
  });

  it('se llevan los 3 mejores, y si empatan, primero el menos usado', async () => {
    const rows = await withScripts(
      [
        { topic: 'A tweets', triggers: ['tweets'], used: 9 },
        { topic: 'B tweets', triggers: ['tweets'], used: 1 },
        { topic: 'C tweets', triggers: ['tweets'], used: 5 },
        { topic: 'D tweets', triggers: ['tweets'], used: 0 },
        { topic: 'E tweets semana', triggers: ['tweets', 'semana'], used: 50 },
      ],
      (sql) => pickFor(sql, 'tweets de la semana'),
    );
    expect(rows.map((r) => r.script_topic)).toEqual(['E tweets semana', 'D tweets', 'B tweets']);
  });

  it('los «siempre» entran en todas las respuestas, aunque no sumen puntos', async () => {
    const rows = await withScripts(
      [
        { topic: 'Fuera de tema', triggers: [], always: true },
        { topic: 'Saludo', triggers: ['hola'] },
      ],
      (sql) => pickFor(sql, 'zzzz'),
    );
    expect(rows.map((r) => [r.script_topic, r.script_always])).toEqual([['Fuera de tema', true]]);
  });

  it('solo los guiones que se le ofrecen a ese rol', async () => {
    const rows = await withScripts(
      [
        { topic: 'Aprobar piezas', triggers: ['como apruebo'], roles: '{admin,boss}' },
        { topic: 'Aprobar para todos', triggers: ['como apruebo'] },
      ],
      async (sql) => ({ camera: await pickFor(sql, 'como apruebo', '{camera}'), boss: await pickFor(sql, 'como apruebo', '{boss}') }),
    );
    expect(rows.camera.map((r) => r.script_topic)).toEqual(['Aprobar para todos']);
    expect(rows.boss.map((r) => r.script_topic).sort()).toEqual(['Aprobar para todos', 'Aprobar piezas']);
  });

  it('p_count cuenta el uso; el probador (false) no', async () => {
    const used = await withScripts([{ topic: 'Saludo', triggers: ['hola'] }], async (sql) => {
      await pickFor(sql, 'hola hola', '{admin}', 3, false);
      const a = (await sql.one<{ n: number }>(`select times_used as n from public.assistant_scripts where topic = 'Saludo' and active`))!.n;
      await pickFor(sql, 'hola hola', '{admin}', 3, true);
      const b = (await sql.one<{ n: number; at: Date | null }>(`select times_used as n, last_used_at as at from public.assistant_scripts where topic = 'Saludo' and active`))!;
      return { a, b };
    });
    expect(used.a).toBe(0);
    expect(used.b.n).toBe(1);
    expect(used.b.at).not.toBeNull();
  });

  it('con los guiones de fábrica, preguntas típicas traen el que les toca', async () => {
    const cases: [string, string, string][] = [
      ['¿cómo te llamas?', '{social}', 'fabrica:quien-eres'],
      ['quiero hablar con alguien', '{camera}', 'fabrica:hablar-persona'],
      ['¿qué tengo pendiente hoy?', '{dispatch}', 'fabrica:pendientes'],
      ['¿cuántos días de tweets quedan?', '{social}', 'fabrica:dias-tweets'],
      ['¿a qué hora es el evento?', '{social}', 'fabrica:agenda-privada'],
      ['¿cómo subo el material?', '{camera}', 'fabrica:subir-material'],
    ];
    for (const [q, roles, key] of cases) {
      const rows = await t.system((sql) => pickFor(sql, q, roles));
      expect(rows.map((r) => r.script_key), q).toContain(key);
      expect(rows.filter((r) => r.script_always).map((r) => r.script_key)).toEqual(['fabrica:fuera-de-tema']);
    }
  });
});

describe('fichas automáticas (assistant_refresh)', () => {
  it('salen de la plataforma: marca, semáforo, fórmulas, reglas por red, mejores horas y categorías', async () => {
    const keys = (await t.system((sql) => sql.query<{ key: string }>(`select key from public.assistant_knowledge where origin = 'plataforma' and active and key like 'auto:%'`))).map((r) => r.key);
    for (const k of ['auto:marca', 'auto:semaforo', 'auto:formulas', 'auto:formula:FAB', 'auto:red:tiktok', 'auto:horas:tiktok', 'auto:tweets', 'auto:categorias:content']) {
      expect(keys).toContain(k);
    }
    const marca = await t.system((sql) => sql.one<{ body: string }>(`select body from public.assistant_knowledge where key = 'auto:marca'`));
    const brand = await t.system((sql) => sql.one<{ value: { appName: string } }>(`select value from public.app_settings where key = 'brand'`));
    expect(marca!.body).toContain(brand!.value.appName);
  });

  it('un cambio en la plataforma se entera solo (disparador por sentencia)', async () => {
    await t.system((sql) => sql.query(`update public.copy_formulas set description = 'Descripción de prueba del disparador.' where code = 'FAB'`));
    const f = await t.system((sql) => sql.one<{ body: string }>(`select body from public.assistant_knowledge where key = 'auto:formula:FAB'`));
    expect(f!.body).toContain('Descripción de prueba del disparador.');
  });

  it('lo que el equipo editó no se pisa; lo que ya no existe se apaga, no se borra', async () => {
    await t.system(async (sql) => {
      await sql.query(`update public.assistant_knowledge set origin = 'equipo', body = 'Texto afinado por el equipo.' where key = 'auto:formula:PAS'`);
      await sql.query(`update public.copy_formulas set description = 'Otra descripción.' where code = 'PAS'`);
    });
    const pas = await t.system((sql) => sql.one<{ body: string; origin: string }>(`select body, origin from public.assistant_knowledge where key = 'auto:formula:PAS'`));
    expect(pas).toEqual({ body: 'Texto afinado por el equipo.', origin: 'equipo' });

    await t.system((sql) => sql.query(`update public.copy_formulas set active = false where code = 'AIDA'`));
    const aida = await t.system((sql) => sql.one<{ active: boolean }>(`select active from public.assistant_knowledge where key = 'auto:formula:AIDA'`));
    expect(aida).toEqual({ active: false });
    await t.system((sql) => sql.query(`update public.copy_formulas set active = true where code = 'AIDA'`));
  });

  it('si el asistente no puede ponerse al día, el cambio de la plataforma se guarda igual', async () => {
    await t.system(async (sql) => {
      await sql.query(`alter function public.assistant_refresh() rename to assistant_refresh_ok`);
      await sql.query(`create function public.assistant_refresh() returns int language plpgsql as $$ begin raise exception 'roto a propósito'; end $$`);
    });
    try {
      await t.system((sql) => sql.query(`update public.copy_formulas set name = name || ' ' where code = 'FAB'`));
      const n = await t.system((sql) => sql.one<{ name: string }>(`select name from public.copy_formulas where code = 'FAB'`));
      expect(n!.name.endsWith(' ')).toBe(true);
    } finally {
      await t.system(async (sql) => {
        await sql.query(`drop function public.assistant_refresh()`);
        await sql.query(`alter function public.assistant_refresh_ok() rename to assistant_refresh`);
        await sql.query(`update public.copy_formulas set name = rtrim(name) where code = 'FAB'`);
      });
    }
  });
});

describe('siembra de la guía y los guiones de fábrica («no pisar»)', () => {
  it('siembra todo lo de config/assistant', async () => {
    const r = await t.system(async (sql) => ({
      k: (await sql.one<{ n: number }>(`select count(*)::int as n from public.assistant_knowledge where key like 'guia:%' and active`))!.n,
      s: (await sql.one<{ n: number }>(`select count(*)::int as n from public.assistant_scripts where key like 'fabrica:%' and active`))!.n,
    }));
    expect(r.k).toBe(FACTORY_KNOWLEDGE.length);
    expect(r.s).toBe(FACTORY_SCRIPTS.length);
  });

  it('lo editado por el equipo (y lo que apagó) no se toca al volver a sembrar', async () => {
    await t.system(async (sql) => {
      await sql.query(`update public.assistant_scripts set origin = 'equipo', script = 'Persona: hola\n[ASISTENTE]: Versión del equipo.' where key = 'fabrica:saludo'`);
      await sql.query(`update public.assistant_scripts set active = false where key = 'fabrica:gracias'`);
      await sql.query(`update public.assistant_scripts set script = 'viejo' where key = 'fabrica:dictar'`);
      await seedAssistant(sql);
    });
    const r = await t.system((sql) => sql.query<{ key: string; origin: string; script: string; active: boolean }>(
      `select key, origin, script, active from public.assistant_scripts where key in ('fabrica:saludo', 'fabrica:gracias', 'fabrica:dictar') order by key`,
    ));
    const by = Object.fromEntries(r.map((x) => [x.key, x]));
    expect(by['fabrica:saludo'].script).toContain('Versión del equipo.');
    expect(by['fabrica:gracias'].active).toBe(false);
    expect(by['fabrica:dictar'].script).not.toBe('viejo'); // untouched factory row: back to the config text
  });
});
