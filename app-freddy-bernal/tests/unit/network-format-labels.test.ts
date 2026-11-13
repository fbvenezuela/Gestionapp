// The format a publication goes out as, on screen (APP-36): «Reel», «Foto», «Historia»…, never the stored word («reel»,
// «photo», «story») in Nueva publicación, Publicar, Una publicación and Resultados. Every format a piece can go out as
// (NETWORK_FORMATS), every format of the network rules (config/network-specs.json) and the old «post» have their label.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import specs from '../../config/network-specs.json';
import { NETWORK_FORMATS } from '@/lib/domain/redes';
import { NETWORK_FORMAT_LABEL, networkFormatLabel } from '@/lib/data/labels';

describe('los formatos de cada red, en palabras', () => {
  it('cada formato de salida y cada formato de las reglas por red tiene su nombre', () => {
    const used = new Set([...Object.values(NETWORK_FORMATS).flat(), ...specs.specs.flatMap((s) => Object.keys(s.formats)), 'post']);
    for (const f of used) {
      expect(NETWORK_FORMAT_LABEL[f], f).toBeTruthy();
      // A word for people: capitalized, and not the stored one.
      expect(NETWORK_FORMAT_LABEL[f], f).toMatch(/^[A-ZÁÉÍÓÚ]/);
    }
    expect(['reel', 'short', 'video', 'photo', 'story', 'carousel', 'post'].map(networkFormatLabel)).toEqual(['Reel', 'Short', 'Video', 'Foto', 'Historia', 'Carrusel', 'Post']);
  });

  it('las cuatro pantallas lo dicen con el nombre, nunca con el valor guardado', () => {
    const read = (f: string) => fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)', f), 'utf8');
    expect(read('publicar/nueva/new-publication.tsx')).toContain('<option key={f} value={f}>{networkFormatLabel(f)}</option>');
    expect(read('publicar/page.tsx')).toContain('networkFormatLabel(p.format)');
    expect(read('publicar/[id]/page.tsx')).toContain('networkFormatLabel(p.format)');
    const results = read('resultados/page.tsx');
    expect(results.match(/networkFormatLabel\(r\.format\)/g)).toHaveLength(2);
    for (const f of ['publicar/page.tsx', 'publicar/[id]/page.tsx', 'resultados/page.tsx']) expect(read(f), f).not.toMatch(/· \{[pr]\.format\}|\$\{p\.format\}/);
  });
});
