// «Descargar todo» of a pauta (cambios del 27/10/2026, §5), the plan before a byte moves: where each file goes and
// what the LEEME says. Rule 4 for every role and the boss too: no name, folder or LEEME line carries the event's
// date, time, address or contacts. Plus the Drive cap check and the browser modes. All data here is invented.
import { describe, it, expect } from 'vitest';
import { budgetMessage, budgetVerdict, buildDownloadPlan, kindsOf, readmeText, type PlanFile, type PlanInput } from '@/lib/media/download-plan';
import { downloadMode, isAppleTouch } from '@/lib/media/download-mode';
import { looksLikeDateTime } from '@/lib/push/text';

const f = (id: string, kind: string, label: string, ext = 'mp4', size = 1_000_000, drive = false): PlanFile => ({ id, kind, label, ext, size, drive });
const FILES: PlanFile[] = [
  f('a', 'boss', 'Jefe hablando 1'),
  f('b', 'drone', 'Dron 1', 'mov', 2_000_000, true),
  f('c', 'storyboard', 'Storyboard 1', 'jpg', 300_000),
  f('d', 'boss', 'Jefe hablando 2', 'mp4', 4_000_000, true),
  f('e', 'broll', 'Tomas de apoyo 1'),
];
const NOTES = [
  { kind: 'editor_note' as const, body: 'Lo mejor está en el segundo clip (demo).', author: 'Kevin' },
  { kind: 'storyboard_text' as const, body: 'Abrir con el dron, luego el saludo (demo).', author: 'Kevin' },
];
const plan = (over: Partial<PlanInput> = {}) => buildDownloadPlan({ title: 'Entrega de la cancha de prueba', code: 'E-0042', files: FILES, notes: NOTES, ...over });

describe('dónde va cada archivo', () => {
  it('una carpeta con el código del evento, una subcarpeta por tipo y el storyboard primero', () => {
    const p = plan();
    expect(p.root).toBe('E-0042');
    expect(p.readme).toMatchObject({ name: 'E-0042-LEEME.txt', path: 'E-0042/E-0042-LEEME.txt' });
    expect(p.entries.map((e) => e.path)).toEqual([
      'E-0042/Storyboard/E-0042-Storyboard-1.jpg',
      'E-0042/Jefe-hablando/E-0042-Jefe-hablando-1.mp4',
      'E-0042/Jefe-hablando/E-0042-Jefe-hablando-2.mp4',
      'E-0042/Dron/E-0042-Dron-1.mov',
      'E-0042/Tomas-de-apoyo/E-0042-Tomas-de-apoyo-1.mp4',
    ]);
    expect(kindsOf(FILES)).toEqual(['storyboard', 'boss', 'drone', 'broll']);
  });

  it('los nombres nunca llevan fecha ni hora, aunque alguien las haya escrito en la etiqueta', () => {
    const p = plan({
      files: [
        f('x', 'boss', 'Jefe hablando 27/10/2026 a las 10:30'),
        f('y', 'drone', 'Dron 2026-10-27'),
        f('z', 'broll', 'Apoyo del 27 de octubre, 9 am'),
        f('w', 'other', '14:30'),
      ],
    });
    for (const e of p.entries) {
      expect(looksLikeDateTime(e.name.replace(/-/g, ' ')), e.name).toBe(false);
      expect(e.name, e.name).not.toMatch(/2026|27|10-30|14-30|octubre/i);
    }
    // A label that was only a time falls back to the kind's name.
    expect(p.entries.find((e) => e.id === 'w')!.name).toBe('E-0042-Otros.mp4');
  });

  it('dos nombres iguales no se pisan; el filtro deja solo lo elegido; un código raro no se usa como carpeta', () => {
    const p = plan({ files: [f('1', 'boss', 'Toma'), f('2', 'boss', 'Toma'), f('3', 'boss', 'toma')] });
    expect(p.entries.map((e) => e.name)).toEqual(['E-0042-Toma.mp4', 'E-0042-Toma-2.mp4', 'E-0042-toma-3.mp4']);
    const only = plan({ kinds: ['storyboard', 'drone'] });
    expect(only.entries.map((e) => e.kind)).toEqual(['storyboard', 'drone']);
    expect(only.totals).toEqual({ files: 2, bytes: 2_300_000, driveBytes: 2_000_000, otherBytes: 300_000 });
    const odd = plan({ code: '27/10 Plaza ../../' });
    expect(odd.root).toBe('Material');
    expect(odd.entries.every((e) => e.path.startsWith('Material/') && !e.path.includes('..'))).toBe(true);
  });

  it('los totales separan lo que viene de Drive (cuenta para el cupo) de lo demás', () => {
    expect(plan().totals).toEqual({ files: 5, bytes: 8_300_000, driveBytes: 6_000_000, otherBytes: 2_300_000 });
  });
});

describe('el LEEME', () => {
  it('lleva el título, la nota para el editor, el storyboard escrito y la lista de archivos', () => {
    const text = plan().readme.text;
    expect(text).toMatch(/^E-0042 · Entrega de la cancha de prueba\n/);
    expect(text).toContain('NOTA DE GRABACIÓN PARA EL EDITOR\nKevin: Lo mejor está en el segundo clip (demo).');
    expect(text).toContain('STORYBOARD CON EL QUE SE GRABÓ (ESCRITO)\nKevin: Abrir con el dron, luego el saludo (demo).');
    expect(text).toContain('ARCHIVOS (5)');
    expect(text).toContain('Jefe-hablando/E-0042-Jefe-hablando-2.mp4 · 4 MB');
  });

  it('nunca la fecha, la hora ni la dirección, ni siquiera cuando quien baja es el jefe (que sí las ve)', () => {
    // What the boss's page holds about the event: the plan has no field for it, and nothing of it reaches the text.
    const bossEvent = {
      title: 'Entrega de la cancha de prueba',
      code: 'E-0042',
      starts_at: '2026-10-27T13:00:00.000Z',
      ends_at: '2026-10-27T15:00:00.000Z',
      exact_address: 'Calle de prueba 3 con carrera 5 (demo)',
      directions: 'Segunda a la derecha (demo)',
      site_contacts: 'Vocera (demo) 0000-0000000',
      day: new Date('2026-10-27T12:00:00Z'),
    };
    const p = buildDownloadPlan({ ...(bossEvent as unknown as PlanInput), files: FILES, notes: NOTES });
    const all = [p.readme.text, p.readme.path, ...p.entries.map((e) => e.path)].join('\n');
    for (const secret of ['2026-10-27', '13:00', 'Calle de prueba', 'Segunda a la derecha', '0000-0000000', 'octubre', 'oct']) {
      expect(all, secret).not.toContain(secret);
    }
    expect(looksLikeDateTime(p.readme.text)).toBe(false);
    // A title that someone wrote with a date is cleaned too.
    expect(readmeText('Entrega del 27/10 a las 9:00', 'E-0042', [], [])).not.toMatch(/27\/10|9:00/);
  });

  it('sin notas lo dice; las notas vacías no salen', () => {
    const text = plan({ notes: [{ kind: 'editor_note', body: '   ', author: 'Kevin' }] }).readme.text;
    expect(text).toContain('Grabación no dejó nota.');
    expect(text).toContain('Grabación no escribió storyboard.');
    expect(text).not.toContain('Kevin');
    // Who does not read the notes (despacho) gets a LEEME without that part, not «no dejó nota».
    const without = plan({ notes: null }).readme.text;
    expect(without).not.toMatch(/NOTA DE GRABACIÓN|STORYBOARD CON EL QUE|no dejó nota/);
    expect(without).toContain('ARCHIVOS (5)');
  });
});

describe('el cupo de Drive, antes de empezar', () => {
  const totals = plan().totals;
  it('sin tope (o sin archivos de Drive) siempre cabe', () => {
    expect(budgetVerdict(totals, null)).toEqual({ ok: true });
    expect(budgetVerdict(totals, { monthLeft: null, todayLeft: null })).toEqual({ ok: true });
    expect(budgetVerdict({ driveBytes: 0 }, { monthLeft: 0, todayLeft: 0 })).toEqual({ ok: true });
    expect(budgetMessage({ ok: true })).toBeNull();
  });

  it('si no cabe en lo que queda hoy (o en el mes), lo dice con los dos tamaños', () => {
    const today = budgetVerdict(totals, { monthLeft: 5e9, todayLeft: 1_000_000 });
    expect(today).toEqual({ ok: false, why: 'today', left: 1_000_000, need: 6_000_000 });
    expect(budgetMessage(today)).toBe('De Drive esto pesa 6 MB y hoy te queda 1 MB de tu cupo. Elige qué bajar hoy, o baja lo que alcance y sigue mañana con la misma carpeta.');
    const month = budgetVerdict(totals, { monthLeft: 0, todayLeft: 5e9 });
    expect(month).toMatchObject({ ok: false, why: 'month' });
    expect(budgetMessage(month)).toMatch(/este mes queda nada para todo el equipo/);
    expect(budgetVerdict(totals, { monthLeft: 6_000_000, todayLeft: 6_000_000 })).toEqual({ ok: true });
  });
});

describe('cómo baja en cada navegador', () => {
  it('carpeta donde hay selector de carpetas; en iPhone y iPad uno por toque; en lo demás, uno tras otro', () => {
    const picker = () => Promise.resolve();
    expect(downloadMode({ showDirectoryPicker: picker, navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' } })).toBe('folder');
    expect(downloadMode({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } })).toBe('ios-list');
    expect(downloadMode({ navigator: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 } })).toBe('ios-list');
    expect(downloadMode({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile' } })).toBe('one-by-one');
    expect(downloadMode({ navigator: { userAgent: 'Mozilla/5.0 (X11; Linux) Firefox/131' } })).toBe('one-by-one');
    expect(downloadMode(undefined)).toBe('one-by-one');
    expect(isAppleTouch({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
  });
});
