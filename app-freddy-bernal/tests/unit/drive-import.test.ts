// The import script (scripts/drive-import): what goes up and what stays out (the video the team
// asked to take down, NO-SUBIR, the .no-subir list), the names in Drive (a number, never the
// original name), no repeats, and uploads that continue after a cut, against the fake Drive.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  driveName, emptyState, excludedBy, isInside, manifestText, normalizeName, parseExcludeFile, parseState, planImport, sourceKey, SESSION_MAX_AGE_MS,
  type ImportState, type LocalFile,
} from '../../scripts/drive-import/plan';
import { DriveRest, runUploads, sessionStatus } from '../../scripts/drive-import/run';
import { resetFakeDrive, type FakeDrive } from '@/lib/storage/drive/fake';
import fb from '../../config/clients/fb.json';
import { looksLikeDateTime } from '@/lib/push/text';

const KIB = 1024;
const CLIENT_EXCLUDE = fb.drive.importExclude;

describe('qué se sube y qué se queda fuera', () => {
  it('el video de Sábados Felices nunca se sube, se llame como se llame', () => {
    for (const name of [
      'Sábados Felices.mp4', 'sabados_felices-entrevista.MOV', 'videos/2024/SABADOS FELICES (corte).mp4', 'Sabados-Felices.webm',
      // Written together, with a hashtag, or with long dashes.
      'Freddy en #SábadosFelices.mp4', 'SabadosFelices.mp4', 'sabadosfelices_2410.mp4', 'Sábados\u2013Felices.mp4', 'Sabados\u2014felices.mov',
      'Sabados Felices (completo).mp4', 'carpeta Sábados Felices/toma 1.mp4',
    ]) {
      expect(excludedBy(name, CLIENT_EXCLUDE), name).toBe('*sabados felices*');
    }
    expect(excludedBy('Felices fiestas.mp4', CLIENT_EXCLUDE)).toBeNull();
    expect(excludedBy('Sábado en el barrio.mp4', CLIENT_EXCLUDE)).toBeNull();
  });

  it('NO-SUBIR al principio del nombre, y las líneas del archivo .no-subir (con * y sin importar acentos)', () => {
    expect(excludedBy('NO-SUBIR-borrador.mp4', [])).toBe('NO-SUBIR');
    expect(excludedBy('carpeta/no subir prueba.mov', [])).toBe('NO-SUBIR');
    expect(excludedBy('NOSUBIR borrador.mp4', [])).toBe('NO-SUBIR');
    // A folder named NO-SUBIR leaves out everything inside it.
    expect(excludedBy('NO-SUBIR/dentro de carpeta.mp4', [])).toBe('NO-SUBIR');
    expect(excludedBy(path.join('fotos', 'No_subir todavia', 'toma.mov'), [])).toBe('NO-SUBIR');
    expect(excludedBy('carpeta/subir luego.mp4', [])).toBeNull();
    const list = parseExcludeFile('# comentario\n\nentrevista vieja.mp4\n*Inauguración*\n   \n');
    expect(list).toEqual(['entrevista vieja.mp4', '*Inauguración*']);
    expect(excludedBy('Entrevista_Vieja.mp4', list)).toBe('entrevista vieja.mp4');
    expect(excludedBy('sub/la inauguracion del puente.mp4', list)).toBe('*Inauguración*');
    expect(excludedBy('otra cosa.mp4', list)).toBeNull();
    expect(normalizeName('Sábados_Felices-1.MP4')).toBe('sabados felices 1 mp4');
    expect(normalizeName('#Sábados\u2013Felices (1).MP4')).toBe('sabados felices 1 mp4');
  });

  it('solo videos; INDICE.md y las fotos no (las fotos se suben con «Subir», que las limpia)', () => {
    const files: LocalFile[] = [
      { rel: 'INDICE.md', size: 900 },
      { rel: 'foto.jpg', size: 5000 },
      { rel: 'b.mov', size: 2000 },
      { rel: 'a.mp4', size: 1000 },
      { rel: 'vacio.mp4', size: 0 },
      { rel: 'Sábados Felices.mp4', size: 3000 },
    ];
    const p = planImport(files, emptyState(), CLIENT_EXCLUDE);
    expect(p.upload.map((u) => [u.rel, u.name, u.mime])).toEqual([
      ['a.mp4', 'ARCHIVO-001.mp4', 'video/mp4'],
      ['b.mov', 'ARCHIVO-002.mov', 'video/quicktime'],
    ]);
    expect(p.excluded).toEqual([{ rel: 'Sábados Felices.mp4', why: '*sabados felices*' }]);
    expect(p.skipped.map((s) => s.rel).sort()).toEqual(['INDICE.md', 'foto.jpg', 'vacio.mp4']);
  });

  it('los nombres en Drive son un número: nunca el original, una fecha ni un lugar', () => {
    const files: LocalFile[] = [{ rel: 'Acto en la plaza Bolívar 28-10-2026 9am.mp4', size: 10 }];
    const p = planImport(files, emptyState(), []);
    expect(p.upload[0].name).toBe('ARCHIVO-001.mp4');
    expect(looksLikeDateTime(p.upload[0].name)).toBe(false);
    expect(driveName('042', 'mov')).toBe('ARCHIVO-042.mov');
  });

  it('cada archivo conserva su número entre corridas; si cambió de tamaño es otro archivo', () => {
    const first = planImport([{ rel: 'a.mp4', size: 10 }, { rel: 'b.mp4', size: 20 }], emptyState(), []);
    first.state.files['a.mp4'].done = true;
    const again = planImport([{ rel: 'c.mp4', size: 5 }, { rel: 'a.mp4', size: 10 }, { rel: 'b.mp4', size: 20 }], parseState(JSON.stringify(first.state)), []);
    expect(again.done).toEqual([{ rel: 'a.mp4', name: 'ARCHIVO-001.mp4' }]);
    expect(again.upload.map((u) => [u.rel, u.seq])).toEqual([['b.mp4', '002'], ['c.mp4', '003']]);
    const changed = planImport([{ rel: 'a.mp4', size: 11 }], again.state, []);
    expect(changed.upload[0].seq).toBe('004');
    expect(sourceKey('a.mp4', 10)).not.toBe(sourceKey('a.mp4', 11));
  });

  it('una subida guardada de hace más de 6 días no se retoma (Google la cierra a la semana)', () => {
    const p = planImport([{ rel: 'a.mp4', size: 10 }], emptyState(), []);
    const s: ImportState = p.state;
    s.files['a.mp4'].session = { url: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=x', at: 1000 };
    expect(planImport([{ rel: 'a.mp4', size: 10 }], s, [], 1000 + 60_000).upload[0].resume?.url).toMatch(/upload_id=x/);
    expect(planImport([{ rel: 'a.mp4', size: 10 }], s, [], 1000 + SESSION_MAX_AGE_MS + 1).upload[0].resume).toBeNull();
  });

  it('un estado roto empieza limpio; la lista para Juan dice qué es cada número', () => {
    expect(parseState('{no es json')).toEqual(emptyState());
    expect(parseState(JSON.stringify({ version: 9 }))).toEqual(emptyState());
    const p = planImport([{ rel: 'sub/entrevista.mp4', size: 10 }], emptyState(), []);
    expect(manifestText(p.state)).toContain('ARCHIVO-001.mp4\tpendiente\tsub/entrevista.mp4');
  });

  it('la carpeta no puede estar dentro del repositorio', () => {
    expect(isInside('/repo/app/videos', '/repo')).toBe(true);
    expect(isInside('/repo', '/repo')).toBe(true);
    expect(isInside('/repositorio-otro', '/repo')).toBe(false);
    expect(isInside('/Users/juan/Desktop/claude/videos', '/Users/juan/code/Gestionapp')).toBe(false);
  });
});

describe('subir a Drive con el script (contra el Drive falso)', () => {
  let dir: string;
  let fake: FakeDrive;
  const noWait = { pause: async () => {} };
  const write = (rel: string, n: number, seed = 1) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), Buffer.from(Uint8Array.from({ length: n }, (_, i) => (i * 13 + seed) % 251)));
  };
  const drive = () => {
    fake.accessTokens.add('tok-script');
    return new DriveRest((u, i) => fake.fetch(u, i), async () => 'tok-script', noWait);
  };

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-import-'));
    write('entrevista.mp4', 600 * KIB, 1);
    write('sub/recorrido.mov', 300 * KIB, 2);
    write('Sábados Felices.mp4', 10 * KIB, 3);
    write('INDICE.md', 100, 4);
  });
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  async function runOnce(state: ImportState, chunk = 256 * KIB) {
    const files: LocalFile[] = [
      { rel: 'entrevista.mp4', size: 600 * KIB },
      { rel: path.join('sub', 'recorrido.mov'), size: 300 * KIB },
      { rel: 'Sábados Felices.mp4', size: 10 * KIB },
      { rel: 'INDICE.md', size: 100 },
    ];
    const plan = planImport(files, state, CLIENT_EXCLUDE);
    const d = drive();
    const { importId } = await d.folders('FB Operaciones 360');
    const saved: string[] = [];
    const r = await runUploads({ drive: d, fetcher: (u, i) => fake.fetch(u, i), folder: dir, plan, state: plan.state, importId, chunk, timing: noWait, save: async (s) => void saved.push(JSON.stringify(s)) });
    return { r, plan, saved, importId };
  }

  it('crea «Importado» dentro de la carpeta de la plataforma, sube los videos con número y marcas privadas, y deja fuera Sábados Felices', async () => {
    fake = resetFakeDrive();
    const { r, plan, importId, saved } = await runOnce(emptyState());
    expect(r).toEqual({ sent: 2, already: 0 });
    const root = [...fake.files.values()].find((f) => f.appProperties.fb360 === 'root')!;
    expect(root.name).toBe('FB Operaciones 360');
    const imp = fake.files.get(importId)!;
    expect(imp).toMatchObject({ name: 'Importado', parents: [root.id], appProperties: { fb360: 'folder', fb360path: 'Importado' } });
    const up = [...fake.files.values()].filter((f) => f.parents.includes(importId));
    expect(up.map((f) => f.name).sort()).toEqual(['ARCHIVO-001.mp4', 'ARCHIVO-002.mov']);
    for (const f of up) {
      expect(f.appProperties).toEqual({ fb360: 'import', sourceKey: expect.stringMatching(/^[0-9a-f]{40}$/), seq: expect.stringMatching(/^00[12]$/) });
      expect(f.name).not.toMatch(/entrevista|recorrido|felices/i);
    }
    expect(Buffer.from(up.find((f) => f.name === 'ARCHIVO-001.mp4')!.bytes).equals(fs.readFileSync(path.join(dir, 'entrevista.mp4')))).toBe(true);
    expect([...fake.files.values()].some((f) => f.bytes.length === 10 * KIB)).toBe(false);
    expect(Object.values(plan.state.files).every((f) => f.done && f.fileId && !f.session)).toBe(true);
    // The state was saved after each session and each finished file.
    expect(saved.length).toBeGreaterThanOrEqual(4);
  });

  it('otra vez, aunque se haya perdido el estado: no repite nada (lo reconoce por su marca en Drive)', async () => {
    const before = fake.files.size;
    const { r } = await runOnce(emptyState());
    expect(r).toEqual({ sent: 0, already: 2 });
    expect(fake.files.size).toBe(before);
  });

  it('si se corta a mitad, la próxima corrida sigue desde donde Google se quedó', async () => {
    fake = resetFakeDrive();
    const files: LocalFile[] = [{ rel: 'entrevista.mp4', size: 600 * KIB }];
    const plan = planImport(files, emptyState(), []);
    const d = drive();
    const { importId } = await d.folders('FB Operaciones 360');
    // The first chunk goes through; from the second one on, the line is gone.
    let chunks = 0;
    let gone = false;
    const cut = async (u: string, i?: RequestInit) => {
      if (u.includes('upload_id=')) {
        if (gone) throw new TypeError('network');
        if (i?.body && ++chunks === 2) {
          gone = true;
          throw new TypeError('network');
        }
      }
      return fake.fetch(u, i);
    };
    await expect(
      runUploads({ drive: d, fetcher: cut, folder: dir, plan, state: plan.state, importId, chunk: 256 * KIB, timing: noWait, save: async () => {} }),
    ).rejects.toThrow(/Sin conexión con Google/);
    const s = plan.state.files['entrevista.mp4'];
    expect(s.done).toBe(false);
    expect(s.session?.url).toMatch(/upload_id=/);
    expect((await sessionStatus((u, i) => fake.fetch(u, i), s.session!.url, 600 * KIB, noWait)).received).toBe(256 * KIB);
    // Next run, from the saved state, with the line back: only what was missing goes.
    const again = planImport(files, parseState(JSON.stringify(plan.state)), []);
    expect(again.upload[0].resume?.url).toBe(s.session!.url);
    const before = fake.calls('uploadChunk').length;
    const r = await runUploads({ drive: d, fetcher: (u, i) => fake.fetch(u, i), folder: dir, plan: again, state: again.state, importId, chunk: 256 * KIB, timing: noWait, save: async () => {} });
    expect(r.sent).toBe(1);
    expect(fake.calls('uploadChunk').length - before).toBe(3); // where it stands + 256 KiB + the last 88 KiB
    const f = [...fake.files.values()].find((x) => x.name === 'ARCHIVO-001.mp4')!;
    expect(Buffer.from(f.bytes).equals(fs.readFileSync(path.join(dir, 'entrevista.mp4')))).toBe(true);
  });

  it('si la subida guardada ya no existe en Google, empieza ese archivo de nuevo', async () => {
    fake = resetFakeDrive();
    const files: LocalFile[] = [{ rel: 'sub/recorrido.mov', size: 300 * KIB }];
    const plan = planImport(files, emptyState(), []);
    plan.upload[0].resume = { url: 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=vencida0001', at: Date.now() };
    const d = drive();
    const { importId } = await d.folders('FB Operaciones 360');
    const r = await runUploads({ drive: d, fetcher: (u, i) => fake.fetch(u, i), folder: dir, plan, state: plan.state, importId, chunk: 256 * KIB, timing: noWait, save: async () => {} });
    expect(r.sent).toBe(1);
    expect([...fake.files.values()].some((f) => f.name === 'ARCHIVO-001.mov')).toBe(true);
  });
});
