// Agenda notices: short Spanish texts with ONLY the event title (rule 4: never the date,
// time, place, address or contacts of the boss's agenda).
import { describe, it, expect } from 'vitest';
import { correctedEventNotice, decisionNotice, newEventNotice, noticeEventTitle, noticeRecipients, noticeTitleChanged } from '@/lib/domain/agenda-notices';
import { MEDIA_LOCK, mediaLockChip, mediaLockSql } from '@/lib/domain/media-lock';
import { looksLikeDateTime } from '@/lib/push/text';

const ID = '11111111-1111-4111-8111-111111111111';

// Invented event with everything the agenda knows about it.
const fullEvent = {
  id: ID,
  title: 'Entrega de la cancha techada de prueba',
  place_name: 'Cancha comunal Inventada',
  municipality: 'Municipio Demo',
  exact_address: 'Calle 9 con carrera 4, sector Inventado',
  directions: 'Segunda a la derecha después de la plaza',
  site_contacts: 'Vocera (demo) 0000-1234567',
  starts_at: '2026-10-28T13:00:00Z',
};

const texts = (n: { title: string; body: string }) => `${n.title} ${n.body}`;

describe('textos de los avisos de la agenda', () => {
  it('evento nuevo por decidir', () => {
    const n = newEventNotice({ id: ID, title: 'Visita a la escuela de prueba' });
    expect(n.title).toBe('Hay un evento nuevo por decidir: Visita a la escuela de prueba');
    expect(n.body).toBe('');
    expect(n.link).toBe(`/eventos/${ID}`);
    expect(n.kind).toBe('event_new');
    expect(n.key).toBe(`event_new:${ID}`);
  });

  it('el jefe aceptó o rechazó', () => {
    expect(decisionNotice({ id: ID, title: 'Visita a la escuela' }, 'accepted', 's').title).toBe('El jefe aceptó: Visita a la escuela');
    expect(decisionNotice({ id: ID, title: 'Visita a la escuela' }, 'rejected', 's').title).toBe('El jefe rechazó: Visita a la escuela');
    expect(decisionNotice({ id: ID, title: 'x' }, 'accepted', 's').kind).toBe('event_decided');
  });

  it('cambiar de opinión es otro aviso; repetir en el mismo minuto, no', () => {
    const a = decisionNotice({ id: ID, title: 'Visita' }, 'accepted', '2026-10-24T10:00');
    const r = decisionNotice({ id: ID, title: 'Visita' }, 'rejected', '2026-10-24T10:00');
    const again = decisionNotice({ id: ID, title: 'Visita' }, 'accepted', '2026-10-24T10:00');
    expect(a.key).not.toBe(r.key);
    expect(a.key).toBe(again.key);
  });

  it('nunca llevan fecha, hora, lugar, dirección ni contactos, aunque se los pasen', () => {
    const ev: { id: string; title: string } = fullEvent;
    for (const n of [newEventNotice(ev), decisionNotice(ev, 'accepted', 'k'), decisionNotice(ev, 'rejected', 'k')]) {
      const out = JSON.stringify({ title: n.title, body: n.body, link: n.link });
      for (const secret of [fullEvent.place_name, fullEvent.municipality, fullEvent.exact_address, fullEvent.directions, fullEvent.site_contacts, '2026', '13:00', '28']) {
        expect(out).not.toContain(secret);
      }
      expect(looksLikeDateTime(texts(n))).toBe(false);
    }
  });

  it('si alguien escribió la fecha o la hora en el título, se borra', () => {
    const dirty = 'Inauguración del puente el 28/10 a las 9:30 a. m., mañana';
    for (const n of [newEventNotice({ id: ID, title: dirty }), decisionNotice({ id: ID, title: dirty }, 'accepted', 'k')]) {
      expect(texts(n)).toContain('Inauguración del puente');
      expect(texts(n)).not.toMatch(/28\/10|9:30|mañana/);
      expect(looksLikeDateTime(texts(n))).toBe(false);
    }
  });

  it('un título que solo era fecha deja un aviso genérico, sin dos puntos colgando', () => {
    expect(newEventNotice({ id: ID, title: '28/10 9:30' }).title).toBe('Hay un evento nuevo por decidir');
    expect(decisionNotice({ id: ID, title: 'mañana' }, 'rejected', 'k').title).toBe('El jefe rechazó un evento');
  });

  it('el título se corta si es muy largo', () => {
    const t = noticeEventTitle('a'.repeat(300));
    expect(t.length).toBeLessThanOrEqual(120);
    expect(t.endsWith('…')).toBe(true);
  });
});

describe('propuesta corregida', () => {
  it('dice que es una corrección (no otro evento nuevo), con el título nuevo y una clave propia', () => {
    const n = correctedEventNotice({ id: ID, title: 'Visita corregida a la biblioteca' }, '2026-10-24T10:00:05');
    expect(n.title).toBe('Corrigieron el evento por decidir: Visita corregida a la biblioteca');
    expect(n.title).not.toBe(newEventNotice({ id: ID, title: 'Visita corregida a la biblioteca' }).title);
    expect(n.kind).toBe('event_new'); // the same switch in Mi perfil turns both off
    expect(n.link).toBe(`/eventos/${ID}`);
    expect(n.body).toBe('');
    expect(correctedEventNotice({ id: ID, title: '28/10 9:30' }, 's').title).toBe('Corrigieron un evento por decidir');
    expect(n.key).toBe(`event_new:${ID}:2026-10-24T10:00:05`);
    expect(n.key).not.toBe(newEventNotice({ id: ID, title: 'x' }).key);
    expect(looksLikeDateTime(texts(correctedEventNotice({ id: ID, title: 'Visita el 28/10 a las 9' }, 's')))).toBe(false);
  });

  it('solo hay aviso nuevo si cambia el título tal como sale en el aviso', () => {
    expect(noticeTitleChanged('Visita de prueba', 'Visita corregida')).toBe(true);
    expect(noticeTitleChanged('Visita de prueba', 'Visita de prueba')).toBe(false);
    // Only the date typed in the title changed: the notice text is the same.
    expect(noticeTitleChanged('Visita de prueba el 28/10', 'Visita de prueba el 29/10')).toBe(false);
  });
});

describe('archivos que no se quitan', () => {
  it('cada motivo tiene su etiqueta y su mensaje; sin motivo, no hay etiqueta', () => {
    expect(mediaLockChip('in_review')).toBe('En revisión');
    expect(mediaLockChip('published')).toBe('En publicación');
    expect(mediaLockChip(null)).toBeNull();
    expect(mediaLockChip('otra-cosa')).toBeNull();
    for (const v of Object.values(MEDIA_LOCK)) expect(v.error).toMatch(/^No se puede quitar: /);
  });

  it('la consulta mira publicaciones, versión aprobada, versión en revisión y audio del jefe', () => {
    const q = mediaLockSql('$1::uuid');
    for (const part of ["'published'", "'approved'", "'in_review'", "'voice_line'", 'p.current_version', 'p.approved_version', "r.status = 'received'"]) expect(q).toContain(part);
  });
});

describe('a quién le llega', () => {
  it('sin repetidos y sin quien hizo el cambio', () => {
    expect(noticeRecipients(['boss', 'dispatch', 'dispatch', null, undefined, 'secretary'], 'secretary')).toEqual(['boss', 'dispatch']);
    expect(noticeRecipients(['creator', 'dispatch'], 'boss')).toEqual(['creator', 'dispatch']);
    expect(noticeRecipients(['dispatch'], 'dispatch')).toEqual([]);
  });
});
