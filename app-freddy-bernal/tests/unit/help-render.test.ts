// /ayuda's pieces rendered without a server (R3, design §5.4): the tutorials' card ends at its last row when 360 is
// still offering help (no empty band under it), and «Para todos» has no Mensajes nor envelope for Administración,
// which has neither (D-49). All data here is invented.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayCircle } from 'lucide-react';
import { HelpList } from '@/components/guides/help-list';
import { OfferReset } from '@/components/guides/offer-reset';
import { SharedTopics } from '@/components/guides/shared-topics';
import { SHARED, sharedFor } from '@/lib/guides';
import { NO_MESSAGES_LINE } from '@/lib/guides/shared';

describe('Ayuda: la tarjeta de tutoriales y «Para todos»', () => {
  it('sin nada que decir, el pie de la tarjeta no deja una franja vacía', () => {
    const items = [{ href: '/hoy?tutorial=bienvenida', label: 'Bienvenida', detail: 'En tu pantalla de inicio', icon: PlayCircle }];
    const out = renderToStaticMarkup(createElement(HelpList, { title: 'Tutoriales de mis pantallas', items, footer: createElement(OfferReset, { userId: 'u-demo' }) }));
    expect(out).not.toContain('border-t');
    expect(out.trimEnd().endsWith('</ul></div>')).toBe(true);
  });

  it('administración: «Para todos» sin Mensajes ni el sobre, y lo dice en una línea', () => {
    const admin = sharedFor({ messages: false });
    expect(admin.map((t) => t.id)).toEqual(SHARED.map((t) => t.id).filter((id) => id !== 'mensajes'));
    const top = admin.find((t) => t.id === 'arriba')!.body;
    expect(top.some((l) => l.startsWith('El sobre:'))).toBe(false);
    expect(top).toContain(NO_MESSAGES_LINE);
    const html = renderToStaticMarkup(createElement(SharedTopics, { topics: admin, id: 'para-todos' }));
    expect(html).not.toContain('Entras por el sobre de arriba');
    expect(html).not.toContain('Mensajes y 360');
    // The team keeps everything.
    expect(sharedFor({ messages: true })).toBe(SHARED);
    expect(renderToStaticMarkup(createElement(SharedTopics, { topics: SHARED }))).toContain('Entras por el sobre de arriba');
  });
});
