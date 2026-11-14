// Mi perfil for each role (F5, R03, R04, R08): the two-factor line only where the role uses it, the notices that
// always arrive said for the person's own roles, the agenda's switches only for whoever edits it (the other one
// named), and the phone notices still off said to Administración or to whoever installed the app. All data invented.
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CRITICAL } from '@/lib/notify';
import { ALWAYS_NOTICES, agendaChangedLabel, alwaysNoticesLine, pushOffText, showsSwitch } from '@/lib/domain/profile-notices';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, refresh: () => {}, replace: () => {} }) }));
vi.mock('@/lib/actions/profile', () => ({ updateProfile: vi.fn() }));

const { ProfileForm } = await import('@/app/(panel)/perfil/profile-form');

const form = (roles: string[], mfaRequired: boolean) =>
  renderToStaticMarkup(createElement(ProfileForm, { fullName: 'Persona Prueba', prefs: {}, mfa: true, mfaRequired, roles }))
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

describe('los avisos que siempre llegan', () => {
  it('cada aviso que no se apaga tiene su línea, y ninguna línea es de otro', () => {
    expect(new Set(ALWAYS_NOTICES.map((n) => n.kind))).toEqual(CRITICAL);
  });

  it('cada rol lee los suyos, nunca uno que no le llega', () => {
    expect(alwaysNoticesLine(['politics'])).toBe('Aparte de estos, siempre te llegan (no se pueden apagar): un evento que se cancela.');
    expect(alwaysNoticesLine(['ivt'])).toBe('Aparte de estos, siempre te llegan (no se pueden apagar): un evento que cambia de fecha u hora y un evento que se cancela.');
    expect(alwaysNoticesLine(['camera'])).toBe(
      'Aparte de estos, siempre te llegan (no se pueden apagar): un evento que te asignan, un evento que cambia de fecha u hora y un evento que se cancela.',
    );
    expect(alwaysNoticesLine(['boss'])).toBe(
      'Aparte de estos, siempre te llegan (no se pueden apagar): un evento que se cancela, una pieza roja por aprobar y una pieza que se pasó de su plazo.',
    );
    const social = alwaysNoticesLine(['social'])!;
    expect(social).toContain('cuando se acaban los tweets');
    expect(social).toContain('una publicación que falló');
    expect(social).not.toContain('pieza roja');
    const admin = alwaysNoticesLine(['admin'])!;
    expect(admin).toContain('los avisos de 360 y los de Google Drive');
    expect(admin).not.toContain('tweets');
    for (const r of ['politics', 'ivt', 'dispatch']) expect(alwaysNoticesLine([r]), r).not.toMatch(/tweets|publicación que falló|pieza roja/);
  });

  it('el cambio en la agenda nombra al otro, y solo para el jefe y el despacho', () => {
    expect(agendaChangedLabel(['boss'])).toBe('Cada cambio que hace el despacho en la agenda (viene apagado)');
    expect(agendaChangedLabel(['dispatch'])).toBe('Cada cambio que hace el jefe en la agenda (viene apagado)');
    expect(agendaChangedLabel(['social'])).toBeNull();
  });

  it('cada interruptor de la agenda, solo para quien puede recibir ese aviso', () => {
    // «Cada cambio…»: only the other manager (agenda-shared.ts, managers()).
    for (const r of ['boss', 'dispatch']) expect(showsSwitch('agenda_changed', [r]), r).toBe(true);
    for (const r of ['social', 'admin', 'camera', 'politics', 'ivt']) expect(showsSwitch('agenda_changed', [r]), r).toBe(false);
    // «Alguien cambió lo mismo que yo…»: whoever wrote what a save replaced, the storyboard included (Redes and
    // Administración write it; Grabación, política and the IVT write no part of an event).
    for (const r of ['boss', 'dispatch', 'social', 'admin']) expect(showsSwitch('agenda_overwritten', [r]), r).toBe(true);
    for (const r of ['camera', 'politics', 'ivt']) expect(showsSwitch('agenda_overwritten', [r]), r).toBe(false);
    expect(showsSwitch('material_ready', ['politics'])).toBe(true);
  });

  it('los avisos al teléfono apagados: Administración avisa a quien instaló la app; los demás, a Administración', () => {
    expect(pushOffText(true)).toContain('avísale a quien la instaló');
    expect(pushOffText(false)).toBe('Los avisos al teléfono todavía no están encendidos en la app. Avísale a Administración.');
  });
});

describe('Mi perfil en la pantalla', () => {
  it('Redes y Grabación: sin línea de doble factor (su rol no lo usa) ni «Cada cambio…» de la agenda', () => {
    for (const r of ['social', 'camera']) {
      const t = form([r], false);
      expect(t, r).not.toContain('Doble factor');
      expect(t, r).not.toContain('Cada cambio que');
      expect(t, r).toContain('Avisos del equipo (los manda Administración)');
      expect(t, r).toContain('Aparte de estos, siempre te llegan (no se pueden apagar):');
    }
    // Redes writes storyboards: someone can save over its own, so it keeps that switch; Grabación never gets it.
    expect(form(['social'], false)).toContain('Alguien cambió lo mismo que yo en la agenda');
    expect(form(['camera'], false)).not.toMatch(/en la agenda/);
  });

  it('el jefe: «Doble factor: entraste con él» y el cambio que hace el despacho', () => {
    const t = form(['boss'], true);
    expect(t).toContain('Doble factor: entraste con él');
    expect(t).toContain('Cada cambio que hace el despacho en la agenda (viene apagado)');
    expect(t).toContain('Alguien cambió lo mismo que yo en la agenda');
    expect(t).not.toContain('el otro');
  });
});
