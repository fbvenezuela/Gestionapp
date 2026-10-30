// The tutorials' catalogue (R3, D-45, design §6.3, §9.2): each one on a SCREENS pattern its roles can open, 2 to 6
// steps on anchors of the closed list (or the stable selectors), short texts without concrete dates and without «toca»
// as an order (U6), unique ids, the form screens marked, and a text per role wherever the step depends on the role
// (U3). The engine itself is tried in tour-core.test.ts.
import { describe, it, expect } from 'vitest';
import { SCREENS, canOpen, screenFor } from '@/lib/assistant/screens';
import { TEAM_ROLES } from '@/lib/roles';
import { HOME_NEXT, HOME_SCREEN, TOURS, homeTourFor, toursForRoles, tourHref, type TourText } from '@/lib/guides';
import { STABLE_TARGETS, TOUR_ANCHORS, anchor } from '@/lib/guides/anchors';
import { concreteDateTime, hasOrder, hasPhone } from '@/lib/guides/check';

const bodies = (b: TourText) => (typeof b === 'string' ? [b] : Object.values(b));
const ALLOWED_TARGETS = new Set<string>([...TOUR_ANCHORS.map((a) => anchor(a)), ...STABLE_TARGETS]);
// Anchors whose step says something different per role (design §9.2): in a tutorial of more than one role, one text
// per role.
const ROLE_DEPENDENT = ['event-save', 'report-agenda', 'visit-date', 'boss-decision', 'schedule-ficha', 'event-when'].map((a) => anchor(a as (typeof TOUR_ANCHORS)[number]));
ROLE_DEPENDENT.push('#antes-de-hablar');
const FORM_SCREENS = ['/agenda/nuevo', '/publicar/nueva', '/tweets/nueva', '/obras/nueva', '/reportes/nuevo', '/aprobar/[id]'];

describe('el catálogo de tutoriales (§6.3)', () => {
  it('ids únicos y con forma', () => {
    const ids = TOURS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]{1,40}$/);
  });

  for (const t of TOURS) {
    describe(t.id, () => {
      it('su pantalla está en SCREENS y la abren todos sus roles', () => {
        expect(t.roles.length).toBeGreaterThan(0);
        for (const r of t.roles) expect(TEAM_ROLES).toContain(r);
        if (t.screen === HOME_SCREEN) return;
        const path = t.screen.split('?')[0];
        expect(screenFor(path)?.href, `${t.screen} no está en SCREENS`).toBe(path);
        for (const r of t.roles) expect(canOpen(path, [r]), `${t.screen} no abre para ${r}`).toBe(true);
      });

      it('de 2 a 6 pasos, cada uno con objetivos de la lista cerrada (o centrado)', () => {
        expect(t.steps.length).toBeGreaterThanOrEqual(2);
        expect(t.steps.length).toBeLessThanOrEqual(6);
        expect(t.steps.filter((s) => s.target.length > 0).length, 'al menos 2 pasos con objetivo, o casi nunca se ofrecería').toBeGreaterThanOrEqual(t.steps.length === 2 ? 1 : 2);
        for (const s of t.steps) {
          if (!s.target.length) expect(s.placement, `${s.title}: sin objetivo tiene que ir centrado`).toBe('center');
          for (const sel of s.target) expect(ALLOWED_TARGETS.has(sel), `${s.title}: ${sel}`).toBe(true);
        }
      });

      it('textos cortos, sin fechas concretas, sin teléfonos y sin «toca» como orden (U6)', () => {
        expect(t.title.length).toBeLessThanOrEqual(40);
        for (const s of t.steps) {
          expect(s.title.length, s.title).toBeLessThanOrEqual(40);
          for (const b of bodies(s.body)) {
            expect(b.length, b).toBeLessThanOrEqual(140);
            expect(b.length, b).toBeGreaterThan(0);
            expect(concreteDateTime(b), b).toBe(false);
            expect(hasPhone(b), b).toBe(false);
            expect(hasOrder(b), b).toBe(false);
          }
        }
      });

      it('un texto por rol donde el paso depende del rol, y cada uno para un rol del tutorial (U3)', () => {
        for (const s of t.steps) {
          if (typeof s.body !== 'string') {
            const keys = Object.keys(s.body);
            for (const k of keys) expect(t.roles, `${s.title}: ${k}`).toContain(k);
            // bodyFor() shows no step to a role without its text: each role of the tutorial has one.
            for (const r of t.roles) expect(s.body[r], `${s.title}: falta el texto de ${r}`).toBeTruthy();
          }
          if (t.roles.length > 1 && s.target.some((x) => ROLE_DEPENDENT.includes(x))) expect(typeof s.body, `${t.id} · ${s.title}`).toBe('object');
        }
      });
    });
  }

  it('las pantallas de formulario van con form (360 no las ofrece) y ninguna otra', () => {
    for (const t of TOURS) expect(!!t.form, t.id).toBe(FORM_SCREENS.includes(t.screen));
  });

  it('cada rol tiene el tutorial de su inicio, y bienvenida lo encadena', () => {
    for (const r of TEAM_ROLES) {
      const mine = toursForRoles([r]);
      const home = homeTourFor([r], mine);
      expect(home, r).not.toBeNull();
      expect(mine.find((t) => t.id === 'bienvenida')?.next, r).toBe(home!.id);
    }
    expect(TOURS.find((t) => t.id === 'bienvenida')?.next).toBe(HOME_NEXT);
    expect(TOURS.filter((t) => t.next).map((t) => t.id)).toEqual(['bienvenida']);
  });

  it('una cuenta con administración no recibe el de Mensajes (D-49), aunque mire como otro rol', () => {
    expect(toursForRoles(['social'], { admin: true }).some((t) => t.screen.startsWith('/mensajes'))).toBe(false);
    expect(toursForRoles(['social']).some((t) => t.id === 'mensajes')).toBe(true);
    expect(toursForRoles(['admin'])).toEqual([]);
  });

  it('la dirección de un tutorial: su pantalla con ?tutorial= (y su pestaña); con [id], ninguna', () => {
    const byId = (id: string) => TOURS.find((t) => t.id === id)!;
    expect(tourHref(byId('redes'), '/hoy')).toBe('/redes?tutorial=redes');
    // A section of Redes is a pattern (/redes/[formato]): its tutorial starts on the section the person is on.
    expect(tourHref(byId('redes-seccion'), '/hoy')).toBeNull();
    expect(tourHref(byId('aprobar-tweets'), '/jefe')).toBe('/aprobar?tab=tweets&tutorial=aprobar-tweets');
    expect(tourHref(byId('bienvenida'), '/obras')).toBe('/obras?tutorial=bienvenida');
    expect(tourHref(byId('pieza'), '/hoy')).toBeNull();
  });

  it('Redes por formato (R4, §6): el tablero, una sección y el feed, con sus anclas, para Redes y el jefe', () => {
    const byId = (id: string) => TOURS.find((t) => t.id === id)!;
    const targets = (id: string) => byId(id).steps.map((s) => s.target[0]);
    expect(byId('redes').screen).toBe('/redes');
    expect(targets('redes')).toEqual(['nav[aria-label="Secciones de Redes"]', anchor('redes-matrix'), anchor('redes-period'), anchor('redes-search'), 'nav[aria-label="Crear en Redes"]']);
    expect(byId('redes-seccion').screen).toBe('/redes/[formato]');
    expect(targets('redes-seccion')).toEqual(['month-tabs', 'month-new', 'month-quota', 'new-piece', 'piece-card', 'card-checks'].map((a) => anchor(a as (typeof TOUR_ANCHORS)[number])));
    expect(byId('feed').screen).toBe('/redes/feed');
    expect(targets('feed')).toEqual(['month-tabs', 'feed-live', 'feed-clear-month', 'feed-grid'].map((a) => anchor(a as (typeof TOUR_ANCHORS)[number])));
    for (const id of ['redes', 'redes-seccion', 'feed', 'pieza']) expect([...byId(id).roles].sort(), id).toEqual(['boss', 'social']);
    // The section's checks say what each role does there: Redes sends, the boss also reviews.
    const checks = byId('redes-seccion').steps.at(-1)!.body as Record<string, string>;
    expect(checks.social).toContain('«Ya lo publiqué»');
    expect(checks.boss).toContain('«Revisar»');
    // The old ones are gone: no tutorial on /piezas, none on the hidden wrappers of Paso 0.
    expect(TOURS.some((t) => t.screen === '/piezas')).toBe(false);
  });

  it('SCREENS sigue teniendo todas las pantallas de los tutoriales', () => {
    const paths = new Set(SCREENS.map((s) => s.href));
    for (const t of TOURS) if (t.screen !== HOME_SCREEN) expect(paths.has(t.screen.split('?')[0]), t.id).toBe(true);
  });
});
