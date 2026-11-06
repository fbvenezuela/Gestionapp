// A news item can carry a YouTube video (src/lib/web/schema.ts: the importer puts there the first video an old article
// had): the public page shows it after the text with the lite player — a button, never the YouTube frame until the
// person taps — and an invalid code never reaches the page. Invented content only.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NewsArticle } from '@/components/web/item-views';
import type { WebItem } from '@/lib/web/cache';
import { newsSnapshot } from '@/lib/web/schema';
import { normalizeSite } from '@/lib/web/site-settings';

const site = normalizeSite({}, { demo: true, indexable: false, baseUrl: 'https://web.prueba.test' });

function news(youtubeId: string | null): WebItem<'news'> {
  const data = newsSnapshot.parse({ title: 'Nota con video (prueba)', category: 'noticia', date: '2026-03-10', body: [{ type: 'paragraph', text: 'Texto (prueba).' }], youtubeId });
  return {
    id: '00000000-0000-4000-8000-00000000e001', kind: 'news', slug: 'nota-con-video-prueba', data, media: {}, version: 1,
    publishedAt: '2026-03-10T12:00:00.000Z', liveSince: '2026-03-10T12:00:00.000Z', municipalityId: null, category: 'noticia', state: null, date: '2026-03-10',
  };
}

describe('el video de una noticia', () => {
  it('sale después del texto como un botón «Ver el video», sin cargar YouTube hasta el toque', () => {
    const out = renderToStaticMarkup(h(NewsArticle, { item: news('Abc_def-123'), site, munis: new Map(), related: [] }));
    expect(out).toContain('Ver el video');
    expect(out).not.toContain('<iframe');
    expect(out.indexOf('Texto (prueba).')).toBeLessThan(out.indexOf('Ver el video'));
    expect(renderToStaticMarkup(h(NewsArticle, { item: news(null), site, munis: new Map(), related: [] }))).not.toContain('Ver el video');
  });

  it('un código que no es de YouTube no pasa el esquema', () => {
    expect(newsSnapshot.safeParse({ title: 'x', category: 'noticia', youtubeId: 'javascript:alert(1)' }).success).toBe(false);
    expect(newsSnapshot.safeParse({ title: 'x', category: 'noticia', youtubeId: 'corto' }).success).toBe(false);
  });
});
