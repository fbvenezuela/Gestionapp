// Ajustes → Registro after Mensajes became channels (R5 review 2, point 4): the old rows of the notice
// (chat_notice_ack) and of «Quién habla con quién» (chat_rules) stay in audit_log, and the page names them with one
// neutral label, never the raw table name. The session and the database are mocked; all data here is invented.
import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const rows = [
  { id: 3, at: '2026-10-28T15:00:00.000Z', actor: 'Daniela Prueba', table_name: 'chat_notice_ack', action: 'insert', row_id: null, changed: null },
  { id: 2, at: '2026-10-28T14:00:00.000Z', actor: 'Jefe Prueba', table_name: 'chat_rules', action: 'update', row_id: null, changed: null },
  { id: 1, at: '2026-10-28T13:00:00.000Z', actor: 'Jefe Prueba', table_name: 'chat_conversations', action: 'insert', row_id: null, changed: null },
];
vi.mock('@/lib/auth/session', () => ({
  requireRole: vi.fn(async () => ({ userId: 'admin-prueba', roles: ['admin'] })),
  db: vi.fn(async () => rows),
}));

const { default: AuditPage } = await import('@/app/(panel)/ajustes/registro/page');

describe('el registro y lo que había en Mensajes antes de los canales', () => {
  it('nombra el aviso y las reglas viejas con un nombre neutro, nunca con el nombre de la tabla', async () => {
    const html = renderToStaticMarkup(await AuditPage({ searchParams: Promise.resolve({}) }));
    expect(html).not.toMatch(/chat_notice_ack|chat_rules|chat_conversations/);
    expect(html.match(/Mensajes \(antes de los canales\)/g)).toHaveLength(2);
    expect(html).toContain('creó <span class="font-semibold">Canal</span>');
  });
});
