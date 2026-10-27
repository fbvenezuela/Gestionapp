// Municipalities and parishes (§4.2): one address per municipality, and the parish rules the database applies
// (check_territory) while the official list is pending. Parish names here are invented.
import { describe, it, expect } from 'vitest';
import { getClientConfig } from '@/lib/client-config';
import { parishesSetting } from '@/lib/db/seed-client';
import { municipalityFromSlug, municipalitySlug, normalizeParish, parishAllowed, parishOptions, parishesFor } from '@/lib/domain/territory';

const MUNICIPALITIES = getClientConfig().municipalities as string[];

describe('una dirección por municipio', () => {
  it('los 29 municipios tienen cada uno su dirección, sin acentos ni espacios, y vuelve al nombre', () => {
    expect(MUNICIPALITIES).toHaveLength(29);
    const slugs = MUNICIPALITIES.map(municipalitySlug);
    expect(new Set(slugs).size).toBe(29);
    for (const [i, s] of slugs.entries()) {
      expect(s, MUNICIPALITIES[i]).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(municipalityFromSlug(s, MUNICIPALITIES)).toBe(MUNICIPALITIES[i]);
    }
    expect(municipalitySlug('San Cristóbal')).toBe('san-cristobal');
    expect(municipalitySlug('Junín')).toBe('junin');
  });

  it('acepta el nombre escrito o codificado, y nada que no esté en la lista', () => {
    expect(municipalityFromSlug('San%20Crist%C3%B3bal', MUNICIPALITIES)).toBe('San Cristóbal');
    expect(municipalityFromSlug('JUNIN', MUNICIPALITIES)).toBe('Junín');
    expect(municipalityFromSlug('no-existe', MUNICIPALITIES)).toBeNull();
    expect(municipalityFromSlug('', MUNICIPALITIES)).toBeNull();
    expect(municipalityFromSlug('%E0%A4%A', MUNICIPALITIES)).toBeNull();
  });
});

describe('parroquias mientras llega la lista oficial', () => {
  it('la configuración no inventa parroquias: cada lista es de un municipio de la lista y sin repetidas', () => {
    const map = parishesSetting(getClientConfig().parishes as Record<string, unknown>);
    for (const [m, list] of Object.entries(map)) {
      expect(MUNICIPALITIES, m).toContain(m);
      expect(new Set(list).size, m).toBe(list.length);
    }
    // The note for people ($source) stays in the file, never in the setting.
    expect(Object.keys(map).some((k) => k.startsWith('$'))).toBe(false);
  });

  it('sin lista oficial: texto libre, sugiere lo ya escrito (una vez por forma de escribirlo)', () => {
    const o = parishOptions({}, 'Junín', ['La  Prueba (demo)', 'la prueba (demo)', ' Otra (demo) ', '']);
    expect(o).toEqual({ strict: false, options: ['La Prueba (demo)', 'Otra (demo)'] });
    expect(parishAllowed({}, 'Junín', 'Cualquiera (demo)')).toBe(true);
  });

  it('con lista oficial: solo las de la lista, o en blanco (igual que check_territory)', () => {
    const map = { Junín: ['Parroquia A (demo)', 'Parroquia B (demo)'] };
    expect(parishOptions(map, 'Junín', ['Otra (demo)'])).toEqual({ strict: true, options: map.Junín });
    expect(parishAllowed(map, 'Junín', 'Parroquia A (demo)')).toBe(true);
    expect(parishAllowed(map, 'Junín', '  Parroquia   A (demo) ')).toBe(true);
    expect(parishAllowed(map, 'Junín', 'Otra (demo)')).toBe(false);
    expect(parishAllowed(map, 'Junín', '')).toBe(true);
    // Another municipality without a list stays free text.
    expect(parishAllowed(map, 'Torbes', 'Otra (demo)')).toBe(true);
    expect(parishesFor(map, 'Torbes')).toEqual([]);
  });

  it('espacios como los deja la base: sin bordes y uno solo entre palabras', () => {
    expect(normalizeParish('  La   Prueba  (demo) ')).toBe('La Prueba (demo)');
  });
});
