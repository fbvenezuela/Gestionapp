// /ayuda's pieces rendered without a server (R3, design §5.4): the tutorials' card ends at its last row when 360 is
// still offering help (no empty band under it), «Para todos» has no Mensajes nor the bubbles for Administración, which
// has neither (D-49), and «Palabras de la app» closes «Para todos» when the page passes it (12/11). All data here is
// invented.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayCircle } from 'lucide-react';
import { HelpList } from '@/components/guides/help-list';
import { OfferReset } from '@/components/guides/offer-reset';
import { SharedTopics } from '@/components/guides/shared-topics';
import { GLOSSARY, SHARED, sharedFor } from '@/lib/guides';
import { NO_MESSAGES_LINE, TOP_MESSAGES_LINE } from '@/lib/guides/shared';

describe('Ayuda: la tarjeta de tutoriales y «Para todos»', () => {
  it('sin nada que decir, el pie de la tarjeta no deja una franja vacía', () => {
    const items = [{ href: '/hoy?tutorial=bienvenida', label: 'Bienvenida', detail: 'En tu pantalla de inicio', icon: PlayCircle }];
    const out = renderToStaticMarkup(createElement(HelpList, { title: 'Tutoriales de mis pantallas', items, footer: createElement(OfferReset, { userId: 'u-demo' }) }));
    expect(out).not.toContain('border-t');
    expect(out.trimEnd().endsWith('</ul></div>')).toBe(true);
  });

  it('administración: «Para todos» sin Mensajes ni los globitos, y lo dice en una línea', () => {
    const admin = sharedFor({ messages: false });
    expect(admin.map((t) => t.id)).toEqual(SHARED.map((t) => t.id).filter((id) => id !== 'mensajes'));
    const top = admin.find((t) => t.id === 'arriba')!.body;
    expect(top).not.toContain(TOP_MESSAGES_LINE);
    expect(top).toContain(NO_MESSAGES_LINE);
    expect(SHARED.find((t) => t.id === 'arriba')!.body).toContain(TOP_MESSAGES_LINE);
    const html = renderToStaticMarkup(createElement(SharedTopics, { topics: admin, id: 'para-todos' }));
    expect(html).not.toContain('Entras por los globitos de arriba');
    expect(html).not.toContain('Mensajes y 360');
    expect(html).toContain('>Entrar, lo de arriba, el teléfono, sin señal, la regla de la fecha y 360.<');
    // The team keeps everything.
    expect(sharedFor({ messages: true })).toBe(SHARED);
    const team = renderToStaticMarkup(createElement(SharedTopics, { topics: SHARED }));
    expect(team).toContain('Entras por los globitos de arriba');
    expect(team).toContain('Mensajes y 360.');
  });

  it('«Palabras de la app» cierra «Para todos»: cada palabra con lo que significa, en /ayuda#palabras', () => {
    const html = renderToStaticMarkup(createElement(SharedTopics, { topics: SHARED, glossary: GLOSSARY, id: 'para-todos' }));
    expect(html).toContain('Mensajes, 360 y las palabras de la app.');
    expect(html).toMatch(/<details class="group" id="palabras"><summary[^>]*><span[^>]*>Palabras de la app<\/span>/);
    expect(html.match(/<dt /g)?.length).toBe(GLOSSARY.length);
    expect(html.match(/<dd /g)?.length).toBe(GLOSSARY.length);
    for (const g of GLOSSARY) expect(html).toContain(`>${g.term}</dt>`);
    // It is the last part, and only when the page passes it (the web's and the desk's people do not use the guides).
    expect(html.slice(html.indexOf('id="palabras"'))).not.toContain('<details');
    expect(renderToStaticMarkup(createElement(SharedTopics, { topics: SHARED }))).not.toContain('Palabras de la app');
  });
});
