import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { splitTweets, checkTweets, distribute, daysOfStock, suggestCategory, tweetLength } from '@/lib/domain/tweets';

const TZ = 'America/Caracas';

describe('splitTweets', () => {
  it('separa por numeración y quita el título', () => {
    const doc = 'Tweets semana 3\n\n1. Primer tweet de prueba.\n2) Segundo tweet\ncon dos líneas.\n3 - Tercero.';
    expect(splitTweets(doc)).toEqual(['Primer tweet de prueba.', 'Segundo tweet\ncon dos líneas.', 'Tercero.']);
  });
  it('separa por líneas separadoras', () => {
    expect(splitTweets('Uno\n---\nDos\n***\nTres')).toEqual(['Uno', 'Dos', 'Tres']);
  });
  it('separa por líneas en blanco', () => {
    expect(splitTweets('Uno\n\nDos\n\n\nTres')).toEqual(['Uno', 'Dos', 'Tres']);
  });
  it('formato "Tweet 1:" y comillas', () => {
    expect(splitTweets('Tweet 1: “Hola Táchira”\nTweet 2: Seguimos trabajando')).toEqual(['Hola Táchira', 'Seguimos trabajando']);
  });
  it('no confunde un número dentro del texto', () => {
    expect(splitTweets('Entregamos 40 viviendas.\n\nVamos por 100 más.')).toEqual(['Entregamos 40 viviendas.', 'Vamos por 100 más.']);
  });
});

describe('checkTweets', () => {
  it('cuenta links como 23 y emojis como 2', () => {
    expect(tweetLength('https://example.com/una/ruta/muy/larga/que/no/importa')).toBe(23);
    expect(tweetLength('🌉')).toBe(2);
  });
  it('marca largos y repetidos', () => {
    const r = checkTweets(['Hola Táchira!', 'hola tachira', 'x'.repeat(281)]);
    expect(r[1].duplicateOf).toBe(0);
    expect(r[2].tooLong).toBe(true);
    expect(r[0].tooLong).toBe(false);
  });
});

describe('distribute', () => {
  const slots = [
    { from: '07:00', to: '09:00' },
    { from: '11:30', to: '13:30' },
    { from: '16:30', to: '18:30' },
    { from: '19:00', to: '20:30' },
    { from: '20:30', to: '22:00' },
  ];
  const start = DateTime.fromISO('2026-10-26T06:00', { zone: TZ });
  const times = distribute(30, { start, slots, perDay: { min: 4, max: 5 }, tz: TZ, seed: 42 });

  it('da una hora a cada tweet, en el futuro', () => {
    expect(times).toHaveLength(30);
    expect(times.every((t) => DateTime.fromISO(t) > start)).toBe(true);
  });
  it('4 o 5 por día, nunca dos en la misma hora, sin minutos en :00', () => {
    const byDay = new Map<string, DateTime[]>();
    for (const t of times) {
      const d = DateTime.fromISO(t).setZone(TZ);
      const k = d.toISODate()!;
      byDay.set(k, [...(byDay.get(k) ?? []), d]);
    }
    for (const list of byDay.values()) {
      expect(list.length).toBeLessThanOrEqual(5);
      expect(new Set(list.map((d) => d.hour)).size).toBe(list.length);
      expect(list.every((d) => d.minute !== 0)).toBe(true);
      expect(new Set(list.map((d) => d.minute)).size).toBe(list.length);
    }
    const full = [...byDay.values()].slice(0, -1);
    expect(full.every((l) => l.length >= 4)).toBe(true);
  });
  it('cae dentro de las franjas', () => {
    for (const t of times) {
      const d = DateTime.fromISO(t).setZone(TZ);
      const m = d.hour * 60 + d.minute;
      expect(slots.some((s) => {
        const [ah, am] = s.from.split(':').map(Number);
        const [bh, bm] = s.to.split(':').map(Number);
        return m >= ah * 60 + am && m < bh * 60 + bm;
      })).toBe(true);
    }
  });
  it('respeta las horas ya ocupadas', () => {
    const taken = times.slice(0, 5);
    const more = distribute(5, { start, slots, perDay: { min: 4, max: 5 }, tz: TZ, seed: 42, taken });
    const hours = new Set(taken.map((t) => DateTime.fromISO(t).setZone(TZ).toFormat('yyyy-MM-dd HH')));
    expect(more.every((t) => !hours.has(DateTime.fromISO(t).setZone(TZ).toFormat('yyyy-MM-dd HH')))).toBe(true);
  });
});

describe('daysOfStock', () => {
  const now = DateTime.fromISO('2026-10-26T10:00', { zone: TZ });
  it('cuenta los días hasta el último tweet', () => {
    expect(daysOfStock([now.plus({ days: 4 }).toISO()!], now, TZ)).toBe(5);
    expect(daysOfStock([], now, TZ)).toBe(0);
    expect(daysOfStock([now.minus({ hours: 1 }).toISO()!], now, TZ)).toBe(0);
  });
});

describe('suggestCategory', () => {
  const cats = [
    { id: 'v', name: 'Vialidad' },
    { id: 's', name: 'Salud' },
    { id: 'e', name: 'Educación' },
  ];
  it('elige por palabras clave', () => {
    expect(suggestCategory('Seguimos con el bacheo de la vía principal', cats)).toBe('v');
    expect(suggestCategory('Jornada de vacunación en la escuela', cats)).toBe('s');
    expect(suggestCategory('Nada que ver', cats)).toBeNull();
  });
});
