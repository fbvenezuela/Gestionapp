import { renderToStaticMarkup } from 'react-dom/server';
import type { createElement } from 'react';
import { normalizeSite } from '@/lib/web/site-settings';

// What the renderer's tests of the public website share (web-chrome-render and web-blocks-render, one file until
// 19/11/2026): the test version's site, the static markup of an element and the text no editor's input may ever run.

export const site = normalizeSite({}, { demo: true, indexable: false, baseUrl: 'https://web.prueba.test' });
export const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

export const EVIL = '<script>alert(1)</script><img src=x onerror=alert(2)>';
