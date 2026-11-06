// The redirects of the old site's addresses as the public site reads them (src/lib/web/redirect-map.ts): one old
// address at a time (as anon, by the table's unique index; with the old site imported the table holds some 25.000
// rows and is never read whole), in its candidate forms (the last slash, escapes in capitals, a photo's WordPress
// size), never back to itself, remembered a minute and forgotten when the team changes the list. Invented rows only.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeTestDb, type TestDb } from '../rls/setup';

let t: TestDb;
let map: typeof import('@/lib/web/redirect-map');

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  map = await import('@/lib/web/redirect-map');
  await t.system((sql) =>
    sql.query(
      `insert into public.web_redirects (from_path, to_path, source) values
         ('/2026/03/nota-vieja', '/actualidad/nota-vieja', 'importador'),
         ('/2026/03/se%c3%b1al', '/actualidad/senal', 'importador'),
         ('/wp-content/uploads/2026/03/foto.jpg', '/api/archivos/web/00000000-0000-4000-8000-00000000a001.jpg', 'importador'),
         ('/?p=777', '/actualidad/nota-vieja', 'importador'),
         ('/a-si-misma', '/a-si-misma/', 'manual')`,
    ),
  );
}, 120_000);

describe('las redirecciones de la web vieja, una dirección a la vez', () => {
  it('encuentra la dirección con o sin la barra final, con los escapes en mayúsculas y la foto en otro tamaño', async () => {
    expect(await map.findRedirect('/2026/03/nota-vieja/')).toEqual({ to: '/actualidad/nota-vieja', status: 301 });
    expect(await map.findRedirect('/2026/03/se%C3%B1al')).toEqual({ to: '/actualidad/senal', status: 301 });
    expect(await map.findRedirect('/wp-content/uploads/2026/03/foto-1024x683.jpg')).toEqual({ to: '/api/archivos/web/00000000-0000-4000-8000-00000000a001.jpg', status: 301 });
    expect(await map.findRedirect('/?p=777')).toEqual({ to: '/actualidad/nota-vieja', status: 301 });
    expect(await map.findRedirect('/2026/03/otra')).toBeNull();
    // A redirect to one of its own forms would loop: none.
    expect(await map.findRedirect('/a-si-misma')).toBeNull();
  });

  it('recuerda la respuesta un minuto y la olvida cuando el equipo cambia la lista', async () => {
    await t.system((sql) => sql.query(`update public.web_redirects set to_path = '/gobernador' where from_path = '/2026/03/nota-vieja'`));
    expect(await map.findRedirect('/2026/03/nota-vieja')).toEqual({ to: '/actualidad/nota-vieja', status: 301 });
    map.forgetRedirects();
    expect(await map.findRedirect('/2026/03/nota-vieja')).toEqual({ to: '/gobernador', status: 301 });
  });
});
