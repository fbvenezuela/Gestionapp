// The pending labels of the new website (tests/unit/helpers/pending-labels.ts, design §7): the labels a package retires
// from the screens while the guides and 360 still quote them, one file per package. Every file of the folder has the
// shape; a bad one fails here before it can hide a label; the six label tests accept exactly what the files list.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PENDING_LABELS_DIR, helpText, isPendingLabel, pendingLabelProblems, readPendingLabels, screensText } from './helpers/pending-labels';

const dirs: string[] = [];
function folder(files: Record<string, unknown>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pendientes-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), typeof content === 'string' ? content : JSON.stringify(content));
  return dir;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe('las etiquetas pendientes de la web nueva', () => {
  it('cada archivo de tests/unit/pending-labels tiene la forma y cada etiqueta está una vez en su archivo', () => {
    expect(fs.existsSync(PENDING_LABELS_DIR)).toBe(true);
    expect(() => readPendingLabels()).not.toThrow();
    for (const p of readPendingLabels()) expect(p.file).toBe(`${p.paquete.toLowerCase()}.json`);
  });

  it('lee las de cada paquete y solo esas cuentan como pendientes', () => {
    const dir = folder({
      'wp3.json': { paquete: 'WP3', labels: [{ label: 'Hacer un reporte', why: 'La portada dice «Reporte de vías» (prueba).' }] },
      'wp5.json': { paquete: 'WP5', labels: [{ label: 'Copiar código y clave', why: 'El comprobante dice «Copiar el código» (prueba).' }] },
    });
    expect(readPendingLabels(dir).map((p) => `${p.paquete}: ${p.label}`)).toEqual(['WP3: Hacer un reporte', 'WP5: Copiar código y clave']);
    expect(readPendingLabels(path.join(dir, 'no-existe'))).toEqual([]);
  });

  it('un archivo mal hecho no pasa: nombre, JSON, paquete, comillas, motivo y repetidas', () => {
    const bad: [string, Record<string, unknown>, RegExp][] = [
      ['nombre', { 'WP3.json': { paquete: 'WP3', labels: [] } }, /minúsculas/],
      ['JSON', { 'wp3.json': '{ no es json' }, /no es JSON/],
      ['paquete', { 'wp3.json': { labels: [] } }, /paquete/],
      ['otro nombre', { 'wp3.json': { paquete: 'WP4', labels: [] } }, /se llama como su paquete/],
      ['lista', { 'wp3.json': { paquete: 'WP3', labels: 'Hacer un reporte' } }, /es una lista/],
      ['comillas', { 'wp3.json': { paquete: 'WP3', labels: [{ label: '«Hacer un reporte»', why: 'Un motivo largo (prueba).' }] } }, /sin «»/],
      ['espacios', { 'wp3.json': { paquete: 'WP3', labels: [{ label: ' Hacer un reporte', why: 'Un motivo largo (prueba).' }] } }, /tal como lo citan/],
      ['motivo', { 'wp3.json': { paquete: 'WP3', labels: [{ label: 'Hacer un reporte', why: 'corto' }] } }, /qué la reemplazó/],
      [
        'repetida',
        { 'wp3.json': { paquete: 'WP3', labels: [1, 2].map(() => ({ label: 'Hacer un reporte', why: 'Un motivo largo (prueba).' })) } },
        /dos veces/,
      ],
    ];
    for (const [what, files, message] of bad) expect(() => readPendingLabels(folder(files)), what).toThrow(message);
  });

  it('isPendingLabel lee la carpeta del repositorio: hoy, nada que una prueba de etiquetas tenga que aceptar de más', () => {
    const listed = new Set(readPendingLabels().map((p) => p.label));
    expect(isPendingLabel('Una etiqueta que ninguna pantalla tiene (prueba)')).toBe(false);
    for (const l of listed) expect(isPendingLabel(l), l).toBe(true);
  });

  it('cada etiqueta anotada hace falta: ya no está en las pantallas ni en la configuración, y una guía o 360 todavía la cita', () => {
    expect(pendingLabelProblems()).toEqual([]);
  });

  it('una anotada que sigue en las pantallas sobra, y una que nadie cita también; la que perdió la pantalla y se cita, no', () => {
    const entry = (label: string) => ({ label, why: 'Un motivo largo (prueba).', paquete: 'WP3', file: 'wp3.json' });
    const screens = screensText();
    const help = helpText();
    // «Hacer un reporte»: today on the screens (the home's card, the form's words) and quoted by the guides and 360.
    expect(screens).toContain('Hacer un reporte');
    expect(help).toContain('«Hacer un reporte»');
    expect(pendingLabelProblems([entry('Hacer un reporte')], screens, help)).toEqual([
      '«Hacer un reporte» (wp3.json): sigue en las pantallas o en la configuración, así que no hace falta anotarla',
    ]);
    expect(pendingLabelProblems([entry('Una etiqueta que nadie tiene (prueba)')], screens, help)).toEqual([
      '«Una etiqueta que nadie tiene (prueba)» (wp3.json): ninguna guía ni 360 la cita, así que no hace falta anotarla',
    ]);
    // What a package lists on purpose: gone from the screens, still quoted.
    expect(pendingLabelProblems([entry('Botón viejo (prueba)')], 'otra pantalla', 'Toque «Botón viejo (prueba)» y listo.')).toEqual([]);
    // The patterns of the guides' check count as on the screens too («Nivel amarillo» is built from a value).
    expect(pendingLabelProblems([entry('Nivel amarillo')], 'otra pantalla', 'Vea «Nivel amarillo».')).toHaveLength(1);
  });
});
