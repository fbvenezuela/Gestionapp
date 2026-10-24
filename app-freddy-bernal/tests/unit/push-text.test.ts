import { describe, it, expect } from 'vitest';
import { looksLikeDateTime, pushText, stripDateTime } from '@/lib/push/text';

describe('guardia de texto: nada que parezca fecha u hora sale al teléfono', () => {
  it('quita horas en todos sus formatos', () => {
    for (const s of ['Acto a las 9:30', 'Acto 14:00', 'Acto 9:30 a. m.', 'Acto 9am', 'Acto 7 p.m.', 'Acto 21h30', 'Acto a las 3 de la tarde', 'Acto 18:00 hrs', 'Acto al mediodía']) {
      const out = stripDateTime(s);
      expect(out, s).toBe('Acto' + (s.includes('al mediodía') ? ' al' : ''));
      expect(looksLikeDateTime(out)).toBe(false);
    }
  });

  it('quita fechas en todos sus formatos', () => {
    for (const s of [
      'Entrega 24/10',
      'Entrega 24-10-2026',
      'Entrega 2026-10-24T13:00:00Z',
      'Entrega el 24 de octubre de 2026',
      'Entrega sáb 24 de oct.',
      'Entrega el viernes',
      'Entrega mañana',
      'Entrega hoy',
      'Entrega octubre 24',
    ]) {
      const out = stripDateTime(s);
      expect(looksLikeDateTime(out), `${s} -> ${out}`).toBe(false);
      expect(out.startsWith('Entrega')).toBe(true);
      expect(out).not.toMatch(/\d/);
    }
  });

  it('quita teléfonos (contactos del sitio)', () => {
    expect(stripDateTime('Llamar al 0414-1234567')).toBe('Llamar al');
    expect(stripDateTime('Vocera +58 414 123 4567 en sitio')).toBe('Vocera en sitio');
  });

  it('no toca los textos normales de la app', () => {
    for (const s of [
      'Quedan 5 días de tweets programados',
      'Venció el plazo: «Entrega de la cancha techada de El Mirador» sigue sin aprobar',
      'Pieza por aprobar (amarillo)',
      'Te asignaron un evento',
      'Beneficiados: unas 1.200 personas',
      'Aprobadas 3 piezas verdes',
    ]) expect(stripDateTime(s)).toBe(s);
  });

  it('ordena lo que queda y nunca deja el título vacío', () => {
    expect(stripDateTime('Toca publicar «Reunión» (24/10, 9:30)')).toBe('Toca publicar «Reunión»');
    expect(pushText('24/10 9:30').title).toBe('Tienes un aviso nuevo');
    const long = pushText('x'.repeat(200), 'y'.repeat(400));
    expect(long.title.length).toBeLessThanOrEqual(80);
    expect(long.body.length).toBeLessThanOrEqual(160);
  });
});

describe('guardia de texto: casos con «las»', () => {
  it('quita «desde las 8» y «hasta las 10:30»', () => {
    expect(stripDateTime('Abierto desde las 8 hasta las 10:30')).toBe('Abierto desde hasta');
  });
});

describe('guardia de texto: formas comunes que se escapaban', () => {
  it('quita horas escritas en palabras', () => {
    for (const s of ['Visita al liceo a las nueve', 'Visita al liceo a las nueve de la noche', 'Visita al liceo a la una y media', 'Visita al liceo a las siete y media de la tarde', 'Visita al liceo a las ocho en punto', 'Visita al liceo nueve de la noche', 'Visita al liceo 9 de la mañana']) {
      expect(stripDateTime(s), s).toBe('Visita al liceo');
    }
  });

  it('quita horas con «h» u «horas»', () => {
    for (const s of ['Acto a las 19h', 'Acto 19 horas', 'Acto a las 19 hrs.', 'Acto 8hs', 'Acto 19h']) {
      const out = stripDateTime(s);
      expect(out, s).toBe('Acto');
      expect(looksLikeDateTime(s)).toBe(true);
    }
  });

  it('quita día y mes con guion y mes corto antes del día', () => {
    for (const s of ['Acto 25-oct', 'Acto 25/oct/2026', 'Acto oct. 25', 'Acto oct 25', 'Acto sept. 3']) {
      expect(stripDateTime(s), s).toBe('Acto');
    }
  });

  it('el título del evento no deja pasar la hora al aviso', () => {
    const t = pushText('Hay un evento nuevo por decidir: «Acto 19 horas en el liceo»');
    expect(t.title).toBe('Hay un evento nuevo por decidir: «Acto en el liceo»');
    expect(pushText('Hay un evento nuevo por decidir: Visita al liceo a las nueve').title).toBe('Hay un evento nuevo por decidir: Visita al liceo');
  });

  it('no se come cantidades que no son año', () => {
    expect(stripDateTime('Entrega 24 de octubre 15 piezas')).toBe('Entrega 15 piezas');
    expect(stripDateTime('Te asignaron 2 hermanos')).toBe('Te asignaron 2 hermanos');
  });
});
