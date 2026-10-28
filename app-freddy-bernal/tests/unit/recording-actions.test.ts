// Grabación's handoff (§5), the server actions themselves against a real in-memory database (same migrations, RLS
// on): saving the note again replaces it (one per person, event and kind), only the camera person of the event
// writes it, and the notice to Redes carries the event's title only (never the note, a date, a time or the place),
// once per hour. The storyboard file Grabación uploads tells Redes the same way. Session and notify are mocked.
// All data here is invented.
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type { Session } from '@/lib/auth/session';
import type { Notice } from '@/lib/notify';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import { looksLikeDateTime } from '@/lib/push/text';
import { recordingNotice, noteWarning, firstName } from '@/lib/domain/recording';
import { makeTestDb, type TestDb } from '../rls/setup';

const h = vi.hoisted(() => ({ session: null as unknown, notices: [] as unknown[] }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/session', async (orig) => ({
  ...(await orig<typeof import('@/lib/auth/session')>()),
  requireSession: vi.fn(async () => h.session),
  getSession: vi.fn(async () => h.session),
}));
vi.mock('@/lib/notify', async (orig) => ({
  ...(await orig<typeof import('@/lib/notify')>()),
  notify: vi.fn(async (n: unknown) => {
    h.notices.push(n);
  }),
}));

let t: TestDb;
let recording: typeof import('@/lib/actions/recording');
let media: typeof import('@/lib/actions/media');
let ev: { id: string; title: string; when: string; address: string };

function as(key: DemoUserKey) {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  h.session = {
    userId: t.ids[key], email: u.email, name: u.name, roles: [...u.roles], aal: 'aal2', mfaRequired: false, mfaOk: true,
    claims: { sub: t.ids[key], aal: 'aal2', role: 'authenticated' }, viewAs: null,
  } satisfies Session;
}
const notices = () => h.notices as Notice[];
const noSchedule = () => {
  const out = JSON.stringify(notices().map((n) => [n.title, n.body, n.link]));
  expect(out).not.toContain(ev.address);
  expect(out).not.toContain(ev.when);
  for (const n of notices()) expect(looksLikeDateTime(`${n.title} ${n.body ?? ''}`), n.title).toBe(false);
};

beforeAll(async () => {
  t = await makeTestDb();
  (globalThis as { __fbBackend?: Promise<unknown> }).__fbBackend = Promise.resolve(t.backend);
  recording = await import('@/lib/actions/recording');
  media = await import('@/lib/actions/media');
  // Today's event of «camera» (not «camera2»): it has no note yet (the demo's note is on the court).
  ev = (await t.system((sql) =>
    sql.one<typeof ev>(
      `select e.id, e.title, to_char(s.starts_at, 'YYYY-MM-DD') as when, s.exact_address as address
         from public.events e join public.event_schedule s on s.event_id = e.id
         join public.event_assignments a on a.event_id = e.id and a.user_id = $1
        where not exists (select 1 from public.recording_notes n where n.event_id = e.id)
        order by e.code limit 1`,
      [t.ids.camera],
    ),
  ))!;
});

beforeEach(() => {
  h.notices.length = 0;
});

describe('la nota para el editor', () => {
  it('Grabación la guarda y al guardarla otra vez la reemplaza (una sola); Redes recibe el aviso con el título y nada más', async () => {
    as('camera');
    const first = await recording.saveRecordingNote({ eventId: ev.id, kind: 'editor_note', body: '  Lo mejor está en el segundo clip (demo).  ' });
    expect(first).toMatchObject({ ok: true, message: 'Nota guardada. Redes ya la ve.' });
    const again = await recording.saveRecordingNote({ eventId: ev.id, kind: 'editor_note', body: 'Mejor el tercer clip; el dron tiene viento (demo).' });
    expect((again as { data: { id: string } }).data.id).toBe((first as { data: { id: string } }).data.id);
    const rows = await t.system((sql) => sql.query<{ body: string; author_id: string }>(`select body, author_id from public.recording_notes where event_id = $1 and deleted_at is null`, [ev.id]));
    expect(rows).toEqual([{ body: 'Mejor el tercer clip; el dron tiene viento (demo).', author_id: t.ids.camera }]);
    // The notice: Redes (both), never the person who wrote it; the title only; once in the same hour.
    const [n] = notices();
    expect(n.kind).toBe('recording_note');
    expect([...n.userIds].sort()).toEqual([t.ids.social, t.ids.social2].sort());
    expect(n.title).toBe('Grabación dejó una nota para el editor');
    expect(n.body).toBe(ev.title);
    expect(n.link).toBe(`/eventos/${ev.id}?tab=material`);
    expect(n.key).toMatch(new RegExp(`^recording_note:note:${ev.id}:\\d{4}-\\d{2}-\\d{2}T\\d{2}$`));
    expect(notices().every((x) => x.key === n.key)).toBe(true);
    expect(JSON.stringify(notices())).not.toMatch(/segundo clip|tercer clip|viento/);
    noSchedule();
  });

  it('el storyboard escrito no avisa; una nota vacía tampoco', async () => {
    as('camera');
    expect(await recording.saveRecordingNote({ eventId: ev.id, kind: 'storyboard_text', body: 'Abrir con el dron, luego el saludo (demo).' })).toMatchObject({ ok: true, message: 'Storyboard guardado. Redes ya lo ve.' });
    expect(await recording.saveRecordingNote({ eventId: ev.id, kind: 'editor_note', body: '   ' })).toMatchObject({ ok: true });
    expect(notices()).toEqual([]);
  });

  it('nadie más la escribe en el evento de Grabación: otra persona de Grabación, Redes, despacho, IVT y política no pueden', async () => {
    for (const who of ['camera2', 'social', 'dispatch', 'ivt', 'politics'] as DemoUserKey[]) {
      as(who);
      const r = await recording.saveRecordingNote({ eventId: ev.id, kind: 'editor_note', body: 'No me toca (demo).' });
      expect(r.ok, who).toBe(false);
    }
    expect(notices()).toEqual([]);
    // Nothing changed: only Grabación's own notes are there.
    const authors = await t.system((sql) => sql.query<{ author_id: string }>(`select distinct author_id from public.recording_notes where event_id = $1`, [ev.id]));
    expect(authors).toEqual([{ author_id: t.ids.camera }]);
  });

  it('lo que no es una nota no entra: más de 5000 letras, otro tipo, un evento que no es un id', async () => {
    as('camera');
    expect(await recording.saveRecordingNote({ eventId: ev.id, kind: 'editor_note', body: 'x'.repeat(5001) })).toEqual({ ok: false, error: 'La nota llega hasta 5000 letras.' });
    expect((await recording.saveRecordingNote({ eventId: ev.id, kind: 'brief', body: 'x' })).ok).toBe(false);
    expect((await recording.saveRecordingNote({ eventId: 'E-0001', kind: 'editor_note', body: 'x' })).ok).toBe(false);
  });
});

describe('el storyboard que sube Grabación', () => {
  it('avisa a Redes con el título del evento, sin tocar en qué va el evento', async () => {
    as('camera');
    const before = await t.system((sql) => sql.one<{ work_status: string }>(`select work_status from public.events where id = $1`, [ev.id]));
    const tk = await media.createUpload({ eventId: ev.id, kind: 'storyboard', mime: 'image/jpeg', sizeBytes: 1000, ext: 'jpg', probe: {} });
    expect(tk.ok, JSON.stringify(tk)).toBe(true);
    expect((await media.finishUpload({ id: (tk as { data: { id: string } }).data.id })).ok).toBe(true);
    const n = notices().find((x) => x.kind === 'recording_note')!;
    expect(n).toMatchObject({ title: 'Grabación subió el storyboard con el que grabó', body: ev.title, link: `/eventos/${ev.id}?tab=material` });
    expect([...n.userIds].sort()).toEqual([t.ids.social, t.ids.social2].sort());
    expect(notices().some((x) => x.kind === 'material_ready')).toBe(false);
    expect(await t.system((sql) => sql.one(`select work_status from public.events where id = $1`, [ev.id]))).toEqual(before);
    noSchedule();
  });
});

describe('los textos de la entrega', () => {
  it('el aviso lleva solo el título, limpio de fechas y horas aunque alguien las haya escrito', () => {
    const n = recordingNotice({ id: 'e1', title: 'Jornada del 27/10 a las 9:00 en la escuela' }, 'note', '2026-10-28T14');
    expect(looksLikeDateTime(`${n.title} ${n.body}`)).toBe(false);
    expect(n).toMatchObject({ kind: 'recording_note', link: '/eventos/e1?tab=material', key: 'recording_note:note:e1:2026-10-28T14' });
  });

  it('avisa (sin bloquear) cuando la nota parece llevar una hora o una fecha', () => {
    expect(noteWarning('Llegamos a las 9 de la mañana')).toMatch(/Parece que escribiste una hora/);
    expect(noteWarning('Lo mejor está en el segundo clip')).toBeNull();
    expect(noteWarning('   ')).toBeNull();
  });

  it('el nombre de quien escribe: solo el primero', () => {
    expect(firstName('Kevin Sánchez')).toBe('Kevin');
    expect(firstName('grabacion@demo.test')).toBe('grabacion');
    expect(firstName('')).toBe('Grabación');
  });
});
