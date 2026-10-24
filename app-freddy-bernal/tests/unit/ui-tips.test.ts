import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { TIP_MAX_VIEWS, TIP_MIN_VIEW_MS, afterView, countTipView, dismissTip, isTipVisible, readTip, tipKey } from '@/components/ui/tip-store';
import type { KV } from '@/components/ui/device-store';

function store(broken = false): KV & { data: Record<string, string> } {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k) => {
      if (broken) throw new Error('blocked');
      return data[k] ?? null;
    },
    setItem: (k, v) => {
      if (broken) throw new Error('QuotaExceededError');
      data[k] = v;
    },
  };
}

describe('consejos: cuándo se ven', () => {
  it('se ven hasta 3 veces o hasta tocar «Entendido»', () => {
    expect(isTipVisible(null)).toBe(true);
    expect(isTipVisible('1')).toBe(true);
    expect(isTipVisible(String(TIP_MAX_VIEWS - 1))).toBe(true);
    expect(isTipVisible(String(TIP_MAX_VIEWS))).toBe(false);
    expect(isTipVisible('done')).toBe(false);
    expect(isTipVisible('basura')).toBe(true);
    expect(afterView(null)).toBe('1');
    expect(afterView('1')).toBe('2');
    expect(afterView(String(TIP_MAX_VIEWS - 1))).toBe('done');
    expect(afterView('done')).toBe('done');
  });

  it('una vista cuenta solo si se quedó unos segundos', () => {
    const s = store();
    countTipView(s, 't-count', 500);
    expect(readTip(s, 't-count')).toBeNull();
    for (let i = 0; i < TIP_MAX_VIEWS; i++) {
      expect(isTipVisible(readTip(s, 't-count'))).toBe(true);
      countTipView(s, 't-count', TIP_MIN_VIEW_MS);
    }
    expect(isTipVisible(readTip(s, 't-count'))).toBe(false);
    expect(s.data[tipKey('t-count')]).toBe('done');
  });

  it('«Entendido» lo esconde para siempre en ese teléfono', () => {
    const s = store();
    dismissTip(s, 't-dismiss');
    expect(isTipVisible(readTip(s, 't-dismiss'))).toBe(false);
    countTipView(s, 't-dismiss', 10_000);
    expect(readTip(s, 't-dismiss')).toBe('done');
  });

  it('sin almacenamiento (modo privado) no truena y lo recuerda mientras dure la visita', () => {
    const s = store(true);
    expect(isTipVisible(readTip(s, 't-private'))).toBe(true);
    expect(() => dismissTip(s, 't-private')).not.toThrow();
    expect(isTipVisible(readTip(s, 't-private'))).toBe(false);
  });
});

describe('consejos en las pantallas', () => {
  const pages = ['hoy', 'agenda', 'piezas', 'aprobar', 'publicar', 'tweets'].map((p) => path.join(process.cwd(), `src/app/(panel)/${p}/page.tsx`));
  const tips = pages.flatMap((f) => [...fs.readFileSync(f, 'utf8').matchAll(/<Tip id="([^"]+)">([^<]+)<\/Tip>/g)].map((m) => ({ f, id: m[1], text: m[2] })));

  it('cada pantalla pedida tiene su consejo', () => {
    for (const f of pages) expect(tips.some((t) => t.f === f), f).toBe(true);
  });

  it('ids únicos y una sola frase corta', () => {
    const ids = tips.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of tips) {
      expect(t.text.length, t.id).toBeLessThanOrEqual(110);
      expect(t.text.trim().endsWith('.'), t.id).toBe(true);
      expect(t.text.replace(/«[^»]*»/g, '').split(/[.!?]\s/).length, t.id).toBe(1);
    }
    expect(tips.find((t) => t.id === 'aprobar')?.text).toBe('Las verdes se pueden aprobar juntas; las rojas las aprueba el jefe.');
  });
});
