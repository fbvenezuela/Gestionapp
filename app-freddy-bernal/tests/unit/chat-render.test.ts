// What the screens of Mensajes draw (R3 design §5.3, R5 channels), rendered on the server as the pages do: no notice
// anywhere (D-79), the bubbles (mine, the others', «Mensaje oculto» without its text, a link the reader cannot open),
// the read-only lines in place of the box, the agenda note only where it applies, the list of channels with
// «Archivados», «Quién está» with the boss first, the boss's channel form (the fixed row, the people by role, the
// agenda note) and the «⋯» menu. All data invented.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Role } from '@/lib/roles';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }), usePathname: () => '/mensajes' }));
vi.mock('@/lib/actions/chat', () => ({
  markRead: vi.fn(), sendMessage: vi.fn(), setMuted: vi.fn(), setOnlyBoss: vi.fn(), openTeamChannel: vi.fn(),
  createChannel: vi.fn(), saveChannel: vi.fn(), archiveChannel: vi.fn(),
}));

const { ChatBubble } = await import('@/components/chat/chat-bubble');
const { ChatThread } = await import('@/components/chat/chat-thread');
const { ChannelList } = await import('@/components/chat/channel-list');
const { MembersSheet } = await import('@/components/chat/members-sheet');
const { ChannelForm, groupByRole, joinNames, removeQuestion } = await import('@/components/chat/channel-form');
const { ThreadMenu } = await import('@/components/chat/thread-menu');
const { archiveQuestion, ARCHIVE_BODY } = await import('@/components/chat/archive-button');
const { chatBadgeLabel } = await import('@/components/chat/chat-badge-live');
const { readOnlyText, chatRoles, withDays, membersLine, peopleCount } = await import('@/components/chat/chat-core');
const domain = await import('@/lib/domain/chat');

const html = <P extends object>(c: (p: P) => unknown, p: P) => renderToStaticMarkup(createElement(c as never, p as never));
const ME = 'me-0000';
const NOTICE = /puede leer|Lo lee el jefe|no se borra|Entendido|Quién habla con quién|Escribirle a alguien|Todas las conversaciones/;
const item = (over: Record<string, unknown> = {}) => ({
  id: 'm1', authorId: 'otro', author: 'Daniela Pernía', role: 'Redes', body: 'Ya armé la pieza del parque (inventado).', createdAt: '2026-10-28T14:05:00.000Z', links: [], ...over,
});
const thread = (over: Record<string, unknown> = {}) =>
  html(ChatThread, {
    conversationId: 'c1', me: ME, myName: 'Kevin Sánchez', myRole: 'Grabación', initial: [item()], more: false, moreHref: '/mensajes/c1?n=100',
    firstUnreadId: null, readOnly: null, hidesAgenda: false, agendaNote: false, authorRoles: ['camera'], ...over,
  });
const member = (id: string, name: string, roles: Role[], over: Record<string, unknown> = {}) => ({ id, name, roles, active: true, current: true, boss: roles.includes('boss'), ...over });
const MEMBERS = [
  member('b', 'Jefe (demo)', ['boss']), member('d', 'Daniela Pernía', ['social']), member(ME, 'Kevin Sánchez', ['camera']),
  member('m', 'Mariela Ostos', ['camera']), member('y', 'Yorman Chacón', ['social']),
];

describe('sin aviso en ninguna parte (D-79)', () => {
  it('ni la conversación, ni la caja, ni la lista, ni la hoja de miembros, ni el formulario dicen nada del aviso', () => {
    const all = [
      thread(),
      thread({ readOnly: { reason: 'archived' } }),
      html(ChannelList, { rows: [], archived: [] }),
      html(MembersSheet, { members: MEMBERS, me: ME }),
      html(ChannelForm, { mode: 'create', me: 'b', people: [{ id: 'b', name: 'Jefe (demo)', roles: ['boss'], boss: true }] }),
    ].join('\n');
    expect(all).not.toMatch(NOTICE);
    expect(Object.keys(domain).filter((k) => /NOTICE|ACK|COMPOSER_LINE|DEMO_NOTICE|ROLE_PAIRS|pairAllowed/.test(k))).toEqual([]);
  });
});

describe('las burbujas', () => {
  it('mías a la derecha con «Tú:» para el lector de pantalla; las otras con el nombre', () => {
    const mine = html(ChatBubble, { item: item({ authorId: ME }), own: true, showName: true });
    expect(mine).toContain('items-end');
    expect(mine).toContain('<span class="sr-only">Tú: </span>');
    const theirs = html(ChatBubble, { item: item(), own: false, showName: true });
    expect(theirs).toContain('Daniela · Redes');
  });

  it('«Mensaje oculto»: dice por qué, nunca el texto', () => {
    const h = html(ChatBubble, { item: item({ body: null }), own: false, showName: true });
    expect(h).toContain(domain.CHAT_HIDDEN);
    expect(h).not.toContain('parque');
  });

  it('un enlace de la plataforma: su título, o «Algo que no puedes abrir» sin enlace', () => {
    const ok = html(ChatBubble, { item: item({ links: [{ href: '/mensajes/c2', kind: 'Canal', title: 'Grabación y Redes' }] }), own: false, showName: true });
    expect(ok).toContain('href="/mensajes/c2"');
    expect(ok).toContain('Grabación y Redes');
    const locked = html(ChatBubble, { item: item({ links: [{ href: '/mensajes/c3', kind: 'Canal', title: null }] }), own: false, showName: true });
    expect(locked).toContain('Algo que no puedes abrir');
    expect(locked).not.toContain('href="/mensajes/c3"');
  });
});

describe('el canal', () => {
  it('un registro con nombres, el separador del día y «Mensajes nuevos» en el primero sin leer; la cabecera va con él', () => {
    const h = thread({ header: createElement('header', { id: 'cabecera' }, 'Grabación y Redes'), firstUnreadId: 'm2', initial: [item(), item({ id: 'm2', createdAt: '2026-10-28T14:06:00.000Z' })] });
    expect(h).toContain('id="cabecera"');
    expect(h).toContain('role="log" aria-live="polite" aria-label="Mensajes"');
    expect(h).toContain('miércoles 28 de octubre');
    expect(h.indexOf('mensajes-nuevos')).toBeGreaterThan(h.indexOf('data-message="m1"'));
    expect(h.indexOf('mensajes-nuevos')).toBeLessThan(h.indexOf('data-message="m2"'));
    expect(h).toContain('Daniela · Redes');
    expect(h).toContain('data-tour="chat-composer"');
  });

  it('sin caja: archivado, solo el jefe, o ya no se puede', () => {
    const a = thread({ readOnly: { reason: 'archived' } });
    expect(a).not.toContain('data-tour="chat-composer"');
    expect(a).toContain('Este canal está archivado: se lee, pero ya no se escribe.');
    expect(readOnlyText({ reason: 'only-boss' })).toBe('Solo el jefe escribe en este canal.');
    expect(readOnlyText({ reason: 'closed' })).toBe('Ya no puedes escribir en este canal.');
  });

  it('la nota de la agenda solo con agendaNote', () => {
    expect(thread()).not.toContain(domain.CHAT_AGENDA_NOTE);
    expect(thread({ agendaNote: true, hidesAgenda: true, authorRoles: ['boss'] })).toContain(domain.CHAT_AGENDA_NOTE);
  });

  it('un separador por día, en la hora del Táchira', () => {
    const days = withDays([{ createdAt: '2026-10-28T03:30:00.000Z' }, { createdAt: '2026-10-28T05:00:00.000Z' }, { createdAt: '2026-10-28T14:00:00.000Z' }]);
    expect(days.map((d) => d.day)).toEqual(['martes 27 de octubre', 'miércoles 28 de octubre', null]);
  });
});

describe('quién está (D-81)', () => {
  it('el botón dice cuántos y los primeros nombres, el jefe primero; la hoja tiene a todos con su rol, «(tú)» y «Cerrar»', () => {
    const h = html(MembersSheet, { members: MEMBERS, me: ME, description: 'Tomas, material y piezas' });
    expect(h).toContain('data-tour="chat-members"');
    expect(h).toContain('5 personas');
    expect(h).toContain('· Jefe, Daniela, Kevin, Mariela…');
    expect(h).toMatch(/<dialog aria-labelledby="[^"]+" class="[^"]*glass-sheet/);
    expect(h).toContain('>Miembros</h2>');
    expect(h).toContain('Tomas, material y piezas');
    expect(h.indexOf('Jefe (demo)')).toBeLessThan(h.indexOf('Daniela Pernía'));
    expect(h).toContain('Kevin Sánchez (tú)');
    expect(h).toContain('>Cerrar</button>');
    expect(h).not.toContain('Editar miembros');
    expect(html(MembersSheet, { members: MEMBERS, me: 'b', editHref: '/mensajes/c1/editar' })).toContain('href="/mensajes/c1/editar"');
    expect(peopleCount(1)).toBe('1 persona');
    expect(membersLine(MEMBERS.slice(0, 2))).toBe('Jefe, Daniela');
  });
});

describe('la lista de canales', () => {
  const base = { description: null, archived: false, muted: false, unread: 0, last: null };
  const rows = [
    { ...base, id: 'c1', kind: 'channel' as const, title: 'Grabación y Redes', description: 'Tomas, material y piezas', memberCount: 5, unread: 2, muted: true,
      last: { by: 'Kevin', text: domain.CHAT_HIDDEN, at: '2026-10-28T14:00:00.000Z', hidden: true } },
    { ...base, id: 't', kind: 'team' as const, title: 'Todo el equipo', memberCount: 8 },
  ];
  const archived = [{ ...base, id: 'a1', kind: 'channel' as const, title: 'Jornada de salud', memberCount: 4, archived: true }];

  it('«Todo el equipo» primero; cuántos están; lo sin leer en negrita y dicho; silenciado; lo oculto en cursiva; «Archivados» al final', () => {
    const h = html(ChannelList, { rows, archived });
    expect(h).toContain('data-tour="chat-list"');
    expect(h).toContain('data-tour="chat-team"');
    expect(h.indexOf('Todo el equipo')).toBeLessThan(h.indexOf('Grabación y Redes'));
    expect(h).toContain('5 personas');
    expect(h).toContain('2 mensajes sin leer');
    expect(h).toContain('Silenciado');
    expect(h).toMatch(/class="[^"]*italic[^"]*">Kevin: Mensaje oculto/);
    expect(h).toContain('Archivados (1)');
    expect(h.indexOf('Archivados (1)')).toBeLessThan(h.indexOf('Jornada de salud'));
    expect(h).toContain(domain.CHAT_TEAM_LINE);
  });

  it('sin «Todo el equipo» todavía: un botón que lo abre; sin archivados, nada', () => {
    const h = html(ChannelList, { rows: [rows[0]], archived: [] });
    expect(h).toMatch(/<li data-tour="chat-team"><button type="button"/);
    expect(h).not.toContain('Archivados');
  });
});

describe('«Nuevo canal» y «Editar canal» (D-80, D-85)', () => {
  const people = [
    { id: 'b', name: 'Jefe (demo)', roles: ['boss' as const], boss: true },
    { id: 'r', name: 'Rubén Contreras', roles: ['dispatch' as const], boss: false },
    { id: 'd', name: 'Daniela Pernía', roles: ['social' as const], boss: false },
    { id: 'k', name: 'Kevin Sánchez', roles: ['camera' as const], boss: false },
    { id: 'p', name: 'Política e IVT', roles: ['politics' as const, 'ivt' as const], boss: false },
  ];

  it('el jefe fijo arriba («Tú estás en todos los canales.»), las personas por rol, «Crear canal» apagado hasta tener nombre y alguien', () => {
    const h = html(ChannelForm, { mode: 'create', me: 'b', people });
    expect(h).toContain(domain.CHAT_BOSS_ALWAYS);
    expect(h).toMatch(/<input type="checkbox"[^>]*disabled=""[^>]*checked=""/);
    expect(h.indexOf(domain.CHAT_BOSS_ALWAYS)).toBeLessThan(h.indexOf('Rubén Contreras'));
    expect(h.indexOf('>Despacho</h3>')).toBeLessThan(h.indexOf('>Política</h3>'));
    expect(h.indexOf('>Grabación</h3>')).toBeLessThan(h.indexOf('>Redes</h3>'));
    expect(h).toContain('Nombre del canal');
    expect(h).toContain('Descripción corta (opcional)');
    expect(h).toMatch(/<button[^>]*type="submit"[^>]*disabled=""[^>]*>Crear canal<\/button>/);
    expect(h).not.toContain(domain.CHAT_ADD_READS_BEFORE);
    expect(groupByRole(people.filter((p) => !p.boss)).map((g) => [g.label, g.people.map((p) => p.id)])).toEqual([
      ['Despacho', ['r']], ['Política', ['p']], ['Grabación', ['k']], ['Redes', ['d']],
    ]);
  });

  it('«Editar canal»: un solo «Guardar»; quien agregues ve lo anterior; la nota de la agenda si hay Redes; archivado, la lista quieta', () => {
    const initial = { id: 'c1', title: 'Grabación y Redes', description: 'Tomas', members: ['b', 'd', 'k'], archived: false };
    const h = html(ChannelForm, { mode: 'edit', me: 'b', people, initial });
    expect(h).toContain(domain.CHAT_ADD_READS_BEFORE);
    expect(h.match(/type="submit"/g)).toHaveLength(1);
    expect(h).toContain('>Guardar</button>');
    expect(h).toContain(domain.CHAT_AGENDA_NOTE);
    expect(h).toContain('value="Grabación y Redes"');
    const locked = html(ChannelForm, { mode: 'edit', me: 'b', people, initial: { ...initial, archived: true } });
    expect(locked).toContain('<fieldset disabled="">');
    expect(locked).toContain('Sácalo del archivo para cambiar quién está.');
  });

  it('lo que se pregunta antes de quitar a alguien y antes de archivar', () => {
    expect(joinNames(['Kevin', 'Yorman', 'Mariela'])).toBe('Kevin, Yorman y Mariela');
    expect(removeQuestion(['Kevin', 'Mariela'])).toBe('Kevin y Mariela dejan de ver este canal, también lo anterior.');
    expect(removeQuestion(['Kevin'])).toBe('Kevin deja de ver este canal, también lo anterior.');
    expect(archiveQuestion('Jornada de salud')).toBe('¿Archivar «Jornada de salud»?');
    expect(ARCHIVE_BODY).toMatch(/^Nadie podrá escribir en él\./);
  });
});

describe('el menú «⋯»', () => {
  const menu = (over: Record<string, unknown> = {}) =>
    html(ThreadMenu, { conversationId: 'c1', kind: 'channel', title: 'Grabación y Redes', muted: false, boss: false, onlyBoss: false, archived: false, ...over });

  it('cualquiera: «Silenciar» o «Quitar el silencio», nada más', () => {
    const h = menu();
    expect(h).toContain('Silenciar');
    expect(h).not.toMatch(/Editar canal|Archivar|Solo el jefe escribe/);
    expect(menu({ muted: true })).toContain('Quitar el silencio');
  });

  it('el jefe en un canal: «Solo el jefe escribe», «Editar canal» y «Archivar»; archivado, «Sacar del archivo»; en «Todo el equipo», solo el interruptor', () => {
    const h = menu({ boss: true });
    expect(h).toMatch(/role="switch" aria-checked="false"/);
    expect(h).toContain('href="/mensajes/c1/editar"');
    expect(h).toContain('Archivar');
    expect(menu({ boss: true, archived: true })).toContain('Sacar del archivo');
    const team = menu({ boss: true, kind: 'team' });
    expect(team).toContain('Solo el jefe escribe');
    expect(team).not.toMatch(/Editar canal|Archivar/);
  });
});

describe('el sobre de arriba', () => {
  it('su etiqueta y los roles cortos', () => {
    expect(chatBadgeLabel(0)).toBe('Mensajes');
    expect(chatBadgeLabel(2)).toBe('Mensajes: 2 sin leer');
    expect(chatRoles(['ivt', 'politics', 'admin'])).toBe('Política · IVT');
  });
});
