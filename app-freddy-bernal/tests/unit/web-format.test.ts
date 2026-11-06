// Dates, numbers and the filters of the public pages: always in the Táchira's time zone (a note published at 11 p. m.
// in Caracas is that day, not the next one in UTC), Spanish of Venezuela, the year of the footer by itself, and filter
// values from the address that can only be what the page allows.
import { describe, expect, it } from 'vitest';
import { dayOf, fmtBytes, fmtDay, fmtHours, fmtMoment, fmtMoney, fmtMonth, fmtNumber, fmtShortDay, periodRange } from '@/lib/web/format';
import { choiceParam, dayParam, pageParam, textParam, withQuery } from '@/lib/web/params';
import { filterKey } from '@/lib/web/cache';
import { paletteFrom } from '@/lib/web/palette';
import fs from 'node:fs';
import path from 'node:path';

describe('fechas en la zona del Táchira', () => {
  it('un día y un momento', () => {
    expect(fmtDay('2026-11-04')).toBe('4 de noviembre de 2026');
    expect(fmtDay('2026-11-04', { weekday: true })).toBe('miércoles 4 de noviembre de 2026');
    expect(fmtShortDay('2026-11-04')).toMatch(/^4 nov\.? 2026$/);
    expect(fmtMonth('2026-11-04')).toBe('noviembre de 2026');
    expect(fmtDay(null)).toBe('');
    expect(fmtDay('no es una fecha')).toBe('');
  });

  it('las 11 p. m. en Caracas siguen siendo ese día (en UTC ya es el siguiente)', () => {
    expect(dayOf('2026-11-05T03:30:00.000Z')).toBe('2026-11-04');
    expect(fmtMoment('2026-11-05T03:30:00.000Z')).toBe('4 de noviembre de 2026, 11:30 p. m.');
    expect(fmtMoment('2026-11-05T03:30:00.000Z')).not.toMatch(/[\u00a0\u202f]/);
  });

  it('periodRange: desde el inicio, este año, los últimos 30 días', () => {
    expect(periodRange('todo', '2026-11-06')).toEqual({ from: null, to: '2026-11-06' });
    expect(periodRange('anio', '2026-11-06')).toEqual({ from: '2026-01-01', to: '2026-11-06' });
    expect(periodRange('30d', '2026-11-06')).toEqual({ from: '2026-10-08', to: '2026-11-06' });
  });
});

describe('números, montos y tamaños', () => {
  it('en español de Venezuela', () => {
    expect(fmtNumber(1200000)).toBe('1.200.000');
    expect(fmtNumber(3.25)).toBe('3,3');
    expect(fmtMoney(850000, 'USD')).toBe('850.000 dólares (USD)');
    expect(fmtMoney(1000, 'VES')).toBe('1.000 bolívares (VES)');
    expect(fmtBytes(1007)).toBe('1 KB');
    expect(fmtBytes(250 * 1024)).toBe('250 KB');
    expect(fmtBytes(1.4 * 1024 * 1024)).toBe('1,4 MB');
    expect(fmtHours(null)).toBe('—');
    expect(fmtHours(0.5)).toBe('menos de una hora');
    expect(fmtHours(5)).toBe('5 horas');
    expect(fmtHours(84)).toBe('3,5 días');
  });
});

describe('los filtros que llegan en la dirección', () => {
  it('pageParam, textParam, dayParam y choiceParam no dejan pasar nada raro', () => {
    expect(pageParam(undefined)).toBe(1);
    expect(pageParam('3')).toBe(3);
    expect(pageParam(['2', '9'])).toBe(2);
    for (const bad of ['0', '-1', '1.5', 'abc', '1e3x']) expect(pageParam(bad), bad).toBe(1);
    expect(pageParam('99999')).toBe(500);
    expect(textParam('  agua  ')).toBe('agua');
    expect(textParam('x'.repeat(300)).length).toBe(120);
    expect(dayParam('2026-02-28')).toBe('2026-02-28');
    for (const bad of ['2026-02-30', '2026-2-1', "2026-01-01' or 1=1", '']) expect(dayParam(bad), bad).toBe('');
    expect(choiceParam('concluido', ['anunciado', 'concluido'] as const)).toBe('concluido');
    expect(choiceParam('<script>', ['anunciado', 'concluido'] as const)).toBe('');
  });

  it('withQuery deja fuera lo vacío y la página 1', () => {
    expect(withQuery('/gestion', { municipio: 'junin', categoria: '', pagina: 1 })).toBe('/gestion?municipio=junin');
    expect(withQuery('/actualidad', { q: 'agua potable', pagina: 2 })).toBe('/actualidad?q=agua+potable&pagina=2');
    expect(withQuery('/gestion', {})).toBe('/gestion');
  });

  it('la llave de la caché es la misma para los mismos filtros, en cualquier orden', () => {
    expect(filterKey({ kind: 'news', limit: 4, category: null, q: '' })).toBe(filterKey({ limit: 4, kind: 'news' }));
    expect(filterKey({ kind: 'news', limit: 4 })).not.toBe(filterKey({ kind: 'news', limit: 5 }));
  });
});

describe('los colores de la imagen para compartir salen de tokens.css', () => {
  it('lee la paleta clara y se queja si falta un color', () => {
    const css = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'tokens.css'), 'utf8');
    const p = paletteFrom(css);
    for (const v of Object.values(p)) expect(v).toMatch(/^#[0-9a-f]{6}$/i);
    expect(() => paletteFrom(':root { --c-ivory: #fff; }')).toThrow(/falta/);
  });
});
