import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { DEBOUNCE_MS, LIVE_TABLES, POLL_MS, RESUME_MS, createRefresher, isEditing } from '@/components/shell/live-refresh-core';

const timers = { now: () => Date.now(), setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms), clearTimeout: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };

describe('pantallas en vivo: cuándo refrescar', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('junta muchos cambios en un solo refresco, a los 5 s o más', () => {
    const refresh = vi.fn();
    const r = createRefresher({ refresh, canRefresh: () => true, timers });
    for (let i = 0; i < 10; i++) {
      r.request();
      vi.advanceTimersByTime(300);
    }
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DEBOUNCE_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('deja al menos 5 s entre un refresco y otro, aunque sea un sondeo', () => {
    const refresh = vi.fn();
    const r = createRefresher({ refresh, canRefresh: () => true, timers });
    vi.advanceTimersByTime(DEBOUNCE_MS);
    r.request(0);
    vi.advanceTimersByTime(0);
    expect(refresh).toHaveBeenCalledTimes(1);
    r.request(0);
    vi.advanceTimersByTime(DEBOUNCE_MS - 1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('no refresca mientras escriben: espera a que salgan del campo', () => {
    const refresh = vi.fn();
    let typing = true;
    const r = createRefresher({ refresh, canRefresh: () => !typing, timers });
    r.request();
    vi.advanceTimersByTime(DEBOUNCE_MS * 4);
    expect(refresh).not.toHaveBeenCalled();
    expect(r.pending).toBe(true);
    typing = false;
    r.resume();
    vi.advanceTimersByTime(RESUME_MS);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(r.pending).toBe(false);
    r.resume();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('al salir de la pantalla no queda nada pendiente', () => {
    const refresh = vi.fn();
    const r = createRefresher({ refresh, canRefresh: () => true, timers });
    r.request();
    r.dispose();
    vi.advanceTimersByTime(DEBOUNCE_MS * 2);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('valores pedidos: 5 s entre refrescos y sondeo de un minuto', () => {
    expect(DEBOUNCE_MS).toBeGreaterThanOrEqual(5_000);
    expect(POLL_MS).toBe(60_000);
  });
});

describe('pantallas en vivo: qué cuenta como escribir', () => {
  it('campos de texto, áreas, listas y contenido editable', () => {
    expect(isEditing({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isEditing({ tagName: 'input' })).toBe(true);
    expect(isEditing({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isEditing({ tagName: 'INPUT', type: 'date' })).toBe(true);
    expect(isEditing({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isEditing({ tagName: 'SELECT' })).toBe(true);
    expect(isEditing({ tagName: 'DIV', isContentEditable: true })).toBe(true);
  });
  it('botones, casillas y nada enfocado no cuentan', () => {
    expect(isEditing({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isEditing({ tagName: 'INPUT', type: 'submit' })).toBe(false);
    expect(isEditing({ tagName: 'BUTTON' })).toBe(false);
    expect(isEditing({ tagName: 'BODY' })).toBe(false);
    expect(isEditing(null)).toBe(false);
  });
});

describe('pantallas en vivo: la agenda del jefe no viaja', () => {
  it('nunca escucha event_schedule', () => {
    expect(LIVE_TABLES).toEqual(['pieces', 'tweets', 'publications', 'notifications']);
    expect(LIVE_TABLES as readonly string[]).not.toContain('event_schedule');
    for (const f of ['src/components/shell/live-refresh.tsx', 'src/components/shell/live-refresh-core.ts']) {
      const code = fs.readFileSync(path.join(process.cwd(), f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(code, f).not.toMatch(/event_schedule|event_calendar/);
    }
  });
  it('está montado en el panel', () => {
    expect(fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)/layout.tsx'), 'utf8')).toContain('<LiveRefresh />');
  });
});
