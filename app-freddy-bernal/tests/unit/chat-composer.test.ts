// The box to write in Mensajes (R3, design §5.3, U12, E1): on a phone Enter is a new line and only the button sends;
// the fixed line «Lo lee el jefe…» is always there; the agenda note only where it applies; what is said while writing
// (a phone, a concrete date or time) and what is only asked before sending (a relative word, a time code). Rendered
// on the server as the page does (renderToStaticMarkup). All data invented.
import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatComposer, liveWarning } from '@/components/chat/chat-composer';
import { enterSends, newClientId } from '@/components/chat/chat-core';
import { CHAT_AGENDA_NOTE, CHAT_COMPOSER_LINE, CHAT_PHONE_LINK_TEXT, CHAT_PHONE_TEXT, chatTextProblem } from '@/lib/domain/chat';

const box = (over: Partial<Parameters<typeof ChatComposer>[0]> = {}) =>
  renderToStaticMarkup(
    createElement(ChatComposer, { api: null, conversationId: 'c', hidesAgenda: false, agendaNote: false, authorRoles: ['social'], onSend: () => {}, ...over }),
  );

describe('Enter', () => {
  it('con el dedo (puntero grueso) Enter hace salto de línea: solo el botón envía', () => {
    expect(enterSends({ key: 'Enter', shiftKey: false }, true)).toBe(false);
  });

  it('con teclado y ratón Enter envía; Shift+Enter, o mientras se compone un acento, no', () => {
    expect(enterSends({ key: 'Enter', shiftKey: false }, false)).toBe(true);
    expect(enterSends({ key: 'Enter', shiftKey: true }, false)).toBe(false);
    expect(enterSends({ key: 'Enter', shiftKey: false, isComposing: true }, false)).toBe(false);
    expect(enterSends({ key: 'a', shiftKey: false }, false)).toBe(false);
  });

  it('en el servidor la caja se pinta como en un teléfono (Enter = salto de línea)', () => {
    expect(box()).toMatch(/<textarea[^>]*enterKeyHint="enter"/i);
  });
});

describe('la caja', () => {
  it('lleva su nombre, «Enviar» de 44 px, la línea fija y el ancla del tutorial', () => {
    const html = box();
    expect(html).toContain('data-tour="chat-composer"');
    expect(html).toContain('<label for="');
    expect(html).toContain('>Tu mensaje</label>');
    expect(html).toMatch(/<button type="submit"[^>]*aria-label="Enviar"[^>]*class="[^"]*h-11 w-11/);
    expect(html).toContain(CHAT_COMPOSER_LINE);
    expect(html).toMatch(/text-base/);
    expect(html).not.toContain(CHAT_AGENDA_NOTE);
  });

  it('la nota de la agenda, solo cuando toca (quien la conoce, donde está Redes o política)', () => {
    expect(box({ agendaNote: true, hidesAgenda: true, authorRoles: ['boss'] })).toContain(CHAT_AGENDA_NOTE);
  });
});

describe('lo que dice mientras escribes y lo que pregunta antes de enviar (E1)', () => {
  const boss = { hidesAgenda: true, authorRoles: ['boss'] as const };
  const live = (t: string, ctx: { hidesAgenda: boolean; authorRoles: readonly ('boss' | 'social' | 'camera')[] } = boss) =>
    liveWarning(chatTextProblem(t, { ...ctx, authorRoles: [...ctx.authorRoles], timecodeOk: true, relativeOk: true }));

  it('una hora concreta: «“a las 3” no puede ir aquí»', () => {
    expect(live('Te espero a las 3 en la plaza')).toBe('“a las 3” no puede ir aquí');
  });

  it('un teléfono, siempre y para todos; dentro de un enlace lo dice', () => {
    expect(live('Llámalo al 0414 555 12 34', { hidesAgenda: false, authorRoles: ['social'] })).toBe(CHAT_PHONE_TEXT);
    expect(live('Mira https://wa.me/584145551234', { hidesAgenda: false, authorRoles: ['social'] })).toBe(CHAT_PHONE_LINK_TEXT);
  });

  it('«mañana» o «el lunes» no se avisan mientras escribes: se preguntan al enviar', () => {
    expect(live('Mañana te mando la frase')).toBeNull();
    expect(chatTextProblem('Mañana te mando la frase', { hidesAgenda: true, authorRoles: ['boss'] })).toEqual({ kind: 'relative', word: 'Mañana' });
    expect(chatTextProblem('Mañana te mando la frase', { hidesAgenda: true, authorRoles: ['boss'], relativeOk: true })).toBeNull();
  });

  it('Grabación con un tiempo del video: se pregunta, no se avisa', () => {
    expect(live('En el 2:15 está la toma', { hidesAgenda: true, authorRoles: ['camera'] })).toBeNull();
    expect(chatTextProblem('En el 2:15 está la toma', { hidesAgenda: true, authorRoles: ['camera'] })).toEqual({ kind: 'timecode', word: '2:15' });
  });

  it('Redes escribe libre: nada que avisar ni preguntar', () => {
    expect(chatTextProblem('¿Mañana a las 3 grabamos?', { hidesAgenda: true, authorRoles: ['social'] })).toBeNull();
  });
});

describe('el id de cada mensaje', () => {
  it('un uuid v4, también donde no hay crypto.randomUUID (http sin candado)', () => {
    const id = newClientId({ getRandomValues: <T extends ArrayBufferView | null>(a: T) => crypto.getRandomValues(a as unknown as Uint8Array) as unknown as T });
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newClientId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
