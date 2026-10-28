// What the screens of Mensajes draw (R3, design §5.3), rendered on the server as the pages do: the notice that is always
// there, the dialog to accept it, the bubbles (mine, the others', «Mensaje oculto» without its text, a link the reader
// cannot open), the read-only lines in place of the box, the agenda note only where it applies, the list of
// conversations, and the boss's switches. All data invented.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), usePathname: () => '/mensajes' }));
vi.mock('@/lib/actions/chat', () => ({
  acceptNotice: vi.fn(), markRead: vi.fn(), sendMessage: vi.fn(), setMuted: vi.fn(), setOnlyBoss: vi.fn(), setRoleRule: vi.fn(), startConversation: vi.fn(), openTeamChannel: vi.fn(),
}));

const { ChatNotice, ChatNoticeLine } = await import('@/components/chat/chat-notice');
const { ChatAckDialog } = await import('@/components/chat/chat-ack-dialog');
const { ChatBubble } = await import('@/components/chat/chat-bubble');
const { ChatThread } = await import('@/components/chat/chat-thread');
const { ConversationList } = await import('@/components/chat/conversation-list');
const { RulesEditor, pairLabel } = await import('@/components/chat/rules-editor');
const { blockedLine } = await import('@/components/chat/new-conversation');
const { chatBadgeLabel } = await import('@/components/chat/chat-badge-live');
const { readOnlyText, chatRoles, withDays } = await import('@/components/chat/chat-core');
const domain = await import('@/lib/domain/chat');

const html = <P extends object>(c: (p: P) => unknown, p: P) => renderToStaticMarkup(createElement(c as never, p as never));
const ME = 'me-0000';
const item = (over: Record<string, unknown> = {}) => ({
  id: 'm1', authorId: 'otro', author: 'Daniela Pernía', role: 'Redes', body: 'Ya armé la pieza del parque (inventado).', createdAt: '2026-10-28T14:05:00.000Z', links: [], ...over,
});
const thread = (over: Record<string, unknown> = {}) =>
  html(ChatThread, {
    conversationId: 'c1', me: ME, myName: 'Kevin Sánchez', myRole: 'Grabación', initial: [item()], more: false, moreHref: '/mensajes/c1?n=100',
    firstUnreadId: null, isMember: true, readOnly: null, hidesAgenda: false, agendaNote: false, authorRoles: ['camera'], showNames: false, ...over,
  });

describe('el aviso, siempre (D-50)', () => {
  it('arriba de la lista: quién lee, que no se borra; en la demo, que no se escriba nada real', () => {
    const a = html(ChatNotice, { demo: false });
    expect(a).toContain('role="note"');
    expect(a).toContain(domain.CHAT_NOTICE);
    expect(a).not.toContain(domain.CHAT_DEMO_NOTICE);
    expect(html(ChatNotice, { demo: true })).toContain(domain.CHAT_DEMO_NOTICE);
  });

  it('bajo el título de cada conversación, una línea; pegada a la caja, la otra', () => {
    expect(html(ChatNoticeLine, { demo: false })).toContain(domain.CHAT_NOTICE_LINE);
    expect(html(ChatNoticeLine, { demo: true })).toContain('Demostración: no escribas nada real.');
    expect(thread()).toContain(domain.CHAT_COMPOSER_LINE);
  });

  it('la primera vez, un diálogo que se acepta con «Entendido» (y después ya no)', () => {
    const d = html(ChatAckDialog, { accepted: false, demo: true });
    expect(d).toMatch(/^<dialog aria-labelledby="[^"]+" class="[^"]*glass-sheet/);
    expect(d).toContain(domain.CHAT_ACK_TEXT);
    expect(d).toContain(domain.CHAT_DEMO_NOTICE);
    expect(d).toContain('>Entendido</button>');
    expect(html(ChatAckDialog, { accepted: true, demo: true })).toBe('');
  });
});

describe('las burbujas', () => {
  it('mías a la derecha con «Tú:» para el lector de pantalla; las otras con el nombre', () => {
    const mine = html(ChatBubble, { item: item({ authorId: ME }), own: true, showName: false });
    expect(mine).toContain('items-end');
    expect(mine).toContain('<span class="sr-only">Tú: </span>');
    const theirs = html(ChatBubble, { item: item(), own: false, showName: true });
    expect(theirs).toContain('Daniela · Redes');
    expect(theirs).toContain('bg-surface-2');
  });

  it('«Mensaje oculto»: dice por qué, nunca el texto', () => {
    const h = html(ChatBubble, { item: item({ body: null }), own: false, showName: false });
    expect(h).toContain(domain.CHAT_HIDDEN);
    expect(h).not.toContain('parque');
  });

  it('un enlace de la plataforma: su título, o «Algo que no puedes abrir» sin enlace', () => {
    const ok = html(ChatBubble, { item: item({ links: [{ href: '/eventos/e1', kind: 'Evento', title: 'Cancha de El Mirador' }] }), own: false, showName: false });
    expect(ok).toContain('href="/eventos/e1"');
    expect(ok).toContain('Cancha de El Mirador');
    const locked = html(ChatBubble, { item: item({ links: [{ href: '/eventos/e2', kind: 'Evento', title: null }] }), own: false, showName: false });
    expect(locked).toContain('Algo que no puedes abrir');
    expect(locked).not.toContain('href="/eventos/e2"');
  });

  it('lo mío en camino dice «Enviando…»; lo que se quedó sin señal, «No se envió · Reintentar»', () => {
    expect(html(ChatBubble, { item: item({ authorId: ME, state: 'sending' }), own: true, showName: false })).toContain('Enviando…');
    expect(html(ChatBubble, { item: item({ authorId: ME, state: 'failed' }), own: true, showName: false })).toMatch(/<button[^>]*>No se envió · Reintentar<\/button>/);
  });
});

describe('la conversación', () => {
  it('un registro con nombre, el separador del día y «Mensajes nuevos» en el primero sin leer', () => {
    const h = thread({ firstUnreadId: 'm2', initial: [item(), item({ id: 'm2', createdAt: '2026-10-28T14:06:00.000Z' })] });
    expect(h).toContain('role="log" aria-live="polite" aria-label="Mensajes"');
    expect(h).toContain('miércoles 28 de octubre');
    expect(h).toContain('id="mensajes-nuevos"');
    expect(h.indexOf('mensajes-nuevos')).toBeGreaterThan(h.indexOf('data-message="m1"'));
    expect(h.indexOf('mensajes-nuevos')).toBeLessThan(h.indexOf('data-message="m2"'));
    expect(h).toContain('data-tour="chat-composer"');
  });

  it('«Ver anteriores» solo si hay más', () => {
    expect(thread()).not.toContain('Ver anteriores');
    expect(thread({ more: true })).toContain('href="/mensajes/c1?n=100"');
  });

  it('sin caja: el aviso por aceptar (con «Ver el aviso»), el jefe que lee, la pareja cerrada, solo el jefe, nadie activo', () => {
    const ack = thread({ readOnly: { reason: 'needs-ack' } });
    expect(ack).not.toContain('data-tour="chat-composer"');
    expect(ack).toContain('Para escribir, acepta el aviso.');
    expect(ack).toContain('>Ver el aviso</button>');
    expect(thread({ readOnly: { reason: 'boss-reader' } })).toContain('Estás leyendo como jefe. Aquí no escribes.');
    expect(thread({ readOnly: { reason: 'pair-closed', pair: ['Redes', 'Grabación'] } })).toContain('El jefe cerró los mensajes entre Redes y Grabación. Puedes leer lo anterior.');
    expect(readOnlyText({ reason: 'only-boss' })).toBe('Solo el jefe escribe en esta conversación.');
    expect(readOnlyText({ reason: 'nobody-left' })).toBe('Ya no queda nadie activo en esta conversación.');
  });

  it('la nota de la agenda solo con agendaNote', () => {
    expect(thread()).not.toContain(domain.CHAT_AGENDA_NOTE);
    expect(thread({ agendaNote: true, hidesAgenda: true, authorRoles: ['boss'] })).toContain(domain.CHAT_AGENDA_NOTE);
  });

  it('un separador por día, en la hora del Táchira', () => {
    const days = withDays([{ createdAt: '2026-10-28T03:30:00.000Z' }, { createdAt: '2026-10-28T05:00:00.000Z' }, { createdAt: '2026-10-28T14:00:00.000Z' }]);
    // 03:30 UTC is still the 27th in Caracas (UTC−4).
    expect(days.map((d) => d.day)).toEqual(['martes 27 de octubre', 'miércoles 28 de octubre', null]);
  });
});

describe('la lista y los permisos', () => {
  const rows = [
    { id: 'd1', kind: 'direct' as const, title: 'Kevin Sánchez', roles: 'Grabación', memberCount: 2, last: { by: 'Kevin', text: domain.CHAT_HIDDEN, at: '2026-10-28T14:00:00.000Z', hidden: true }, unread: 2, muted: true },
    { id: 't', kind: 'team' as const, title: 'Todo el equipo', roles: '', memberCount: 8, last: null, unread: 0, muted: false },
  ];

  it('«Todo el equipo» primero; lo sin leer en negrita y dicho; silenciada; lo oculto en cursiva', () => {
    const h = html(ConversationList, { rows });
    expect(h).toContain('data-tour="chat-list"');
    expect(h).toContain('data-tour="chat-team"');
    expect(h.indexOf('Todo el equipo')).toBeLessThan(h.indexOf('Kevin Sánchez'));
    expect(h).toContain('2 mensajes sin leer');
    expect(h).toContain('Silenciada');
    expect(h).toMatch(/class="[^"]*italic[^"]*">Kevin: Mensaje oculto/);
  });

  it('sin «Todo el equipo» todavía: un botón que lo abre', () => {
    expect(html(ConversationList, { rows: [rows[0]] })).toMatch(/<li data-tour="chat-team"><button type="button"/);
  });

  it('cada pareja con los nombres de cada lado; un rol sin nadie dice «nadie»', () => {
    expect(pairLabel({ roleA: 'politics', roleB: 'social', namesA: ['Elio'], namesB: ['Daniela', 'Yorman'] })).toBe('Política (Elio) ↔ Redes (Daniela, Yorman)');
    expect(pairLabel({ roleA: 'dispatch', roleB: 'ivt', namesA: [], namesB: ['Fabián'] })).toBe('Despacho (nadie) ↔ IVT (Fabián)');
  });

  it('los interruptores: role="switch" con su estado, y «Todo el equipo» aparte', () => {
    const pairs = domain.CHAT_ROLE_PAIRS.map((p, i) => ({ ...p, allowed: i !== 0, namesA: ['A'], namesB: ['B'] }));
    const h = html(RulesEditor, { pairs, team: null, demo: true });
    expect(h.match(/role="switch"/g)).toHaveLength(11);
    expect(h).toContain('aria-checked="false"');
    expect(h).toContain('No pueden');
    expect(h).toContain('Todos pueden escribirle al jefe, y tú a todos.');
    expect(h).toContain('Solo el jefe escribe en Todo el equipo');
    expect(h).toContain('las reglas de arriba no cuentan aquí');
    expect(h).toContain('En la demostración, un cambio aquí puede no verse en otro teléfono.');
  });

  it('cuántas personas no se pueden escribir, y el sobre de arriba', () => {
    expect(blockedLine(0)).toBeNull();
    expect(blockedLine(1)).toBe('Hay 1 persona con la que el jefe no permite mensajes.');
    expect(blockedLine(2)).toBe('Hay 2 personas con las que el jefe no permite mensajes.');
    expect(chatBadgeLabel(0)).toBe('Mensajes');
    expect(chatBadgeLabel(2)).toBe('Mensajes: 2 sin leer');
    expect(chatRoles(['ivt', 'politics', 'admin'])).toBe('Política · IVT');
  });
});
