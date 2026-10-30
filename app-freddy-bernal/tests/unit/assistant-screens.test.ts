// «Ir a…» (manual §12, P9): the roles in screens.ts must be the ones each page checks in its
// own code, and a button never leads to a screen the person cannot open.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SCREENS, canOpen, navTarget, pickGoTo, screenFor, screenNamed } from '@/lib/assistant/screens';
import { ROLES, type Role } from '@/lib/roles';

function accessOf(file: string): Role[] | null | 'none' {
  const src = fs.readFileSync(path.join('src', 'app', file), 'utf8');
  const m = /requireRole\(([^)]*)\)/.exec(src.replace(/import[^;]+;/g, ''));
  if (m) return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1] as Role);
  return /requireSession\(\)/.test(src) ? null : 'none';
}

describe('pantallas: roles copiados del control de acceso de cada página', () => {
  for (const s of SCREENS) {
    it(`${s.href} (${s.file})`, () => {
      expect(fs.existsSync(path.join('src', 'app', s.file)), `no existe ${s.file}`).toBe(true);
      const access = accessOf(s.file);
      expect(access, 'la página no comprueba el acceso').not.toBe('none');
      if (access === null || s.roles === null) expect(s.roles).toBe(access);
      else expect([...s.roles].sort()).toEqual([...(access as Role[])].sort());
    });
  }

  it('cada destino se reconoce por frases, nunca por una palabra suelta', () => {
    for (const s of SCREENS) for (const p of s.phrases) expect(p.trim().split(/\s+/).length, `${s.href}: «${p}»`).toBeGreaterThanOrEqual(2);
  });
});

describe('el botón que lleva a la pantalla', () => {
  it('si se usó una herramienta, manda su destino (si la persona puede abrirlo)', () => {
    expect(pickGoTo(['social'], { toolHrefs: ['/tweets'], answer: 'Quedan 4 días.' })).toEqual({ href: '/tweets', label: 'Tweets' });
    expect(pickGoTo(['boss'], { toolHrefs: ['/aprobar/123e4567-e89b-12d3-a456-426614174000'], answer: '' })).toEqual({
      href: '/aprobar/123e4567-e89b-12d3-a456-426614174000',
      label: 'Abrir la pieza',
    });
  });

  it('nunca una pantalla que esa persona no puede abrir: mejor null', () => {
    expect(pickGoTo(['camera'], { toolHrefs: ['/ajustes/redes'], answer: 'Las reglas por red están en Ajustes.' })).toBeNull();
    expect(pickGoTo(['social'], { answer: 'Eso se cambia en Ajustes → Equipo: invitar a alguien es de administración.' })).toBeNull();
    expect(pickGoTo(['camera'], { answer: 'Las piezas se aprueban en Por aprobar.' })).toBeNull();
    expect(canOpen('/piezas/abc', ['dispatch'])).toBe(false);
    expect(canOpen('/eventos/abc', ['camera'])).toBe(true);
  });

  it('por frase en la respuesta (o en la pregunta), no por una palabra suelta', () => {
    expect(pickGoTo(['admin'], { answer: 'Lo ves en la biblioteca, por día.' })).toEqual({ href: '/biblioteca', label: 'Biblioteca' });
    expect(pickGoTo(['boss'], { answer: 'Míralo en Resultados: a qué hora nos va mejor.' })).toEqual({ href: '/resultados', label: 'Resultados' });
    expect(pickGoTo(['social'], { answer: 'Claro.', question: '¿dónde está la agenda?' })).toEqual({ href: '/agenda', label: 'Agenda' });
    // "publicar" alone appears everywhere: no button.
    expect(pickGoTo(['social'], { answer: 'Puedes publicar cuando esté aprobada.' })).toBeNull();
  });

  it('las rutas con id se reconocen por su patrón', () => {
    expect(screenFor('/eventos/123?tab=material')?.href).toBe('/eventos/[id]');
    expect(screenFor('/no-existe')).toBeNull();
  });

  it('todos los roles de screens.ts existen', () => {
    for (const s of SCREENS) for (const r of s.roles ?? []) expect(ROLES).toContain(r);
  });
});

// R3 (design §8.5): the screens of Mensajes and Ayuda, any [param] in a pattern, and Mensajes never for an account
// with Administración (D-49).
describe('R3: Mensajes, Ayuda y cualquier [param]', () => {
  it('las rutas nuevas están, con frases de dos palabras o más', () => {
    for (const href of ['/mensajes', '/mensajes/canales/nuevo', '/mensajes/[id]', '/mensajes/[id]/editar', '/ayuda', '/ayuda/flujos', '/ayuda/administracion', '/ayuda/[id]']) {
      expect(SCREENS.some((s) => s.href === href), href).toBe(true);
    }
  });

  it('un [param] con cualquier nombre es un segmento', () => {
    expect(screenFor('/ayuda/redes')?.href).toBe('/ayuda/[id]');
    expect(screenFor('/ayuda/redes?ver=pantallas')?.href).toBe('/ayuda/[id]');
    expect(screenFor('/eventos/abc/lectura')?.href).toBe('/eventos/[id]/lectura');
    expect(screenFor('/eventos/abc/otra')).toBeNull();
    expect(screenFor('/mensajes/abc')?.href).toBe('/mensajes/[id]');
    // Exact paths first: /mensajes/canales/nuevo is not a channel; a channel's editor is its own screen.
    expect(screenFor('/mensajes/canales/nuevo')?.href).toBe('/mensajes/canales/nuevo');
    expect(screenFor('/mensajes/abc/editar')?.href).toBe('/mensajes/[id]/editar');
  });

  it('Mensajes no se abre con administración, aunque tenga un rol del equipo; Ayuda sí', () => {
    expect(canOpen('/mensajes', ['social'])).toBe(true);
    expect(canOpen('/mensajes/canales/nuevo', ['admin', 'boss'])).toBe(false);
    expect(canOpen('/mensajes/canales/nuevo', ['social'])).toBe(false);
    expect(canOpen('/mensajes/canales/nuevo', ['boss'])).toBe(true);
    expect(canOpen('/mensajes/abc', ['admin', 'boss'])).toBe(false);
    expect(canOpen('/ayuda', ['admin'])).toBe(true);
    expect(pickGoTo(['admin', 'social'], { toolHrefs: ['/mensajes'], answer: '' })).toBeNull();
    expect(pickGoTo(['social'], { answer: 'Míralo en mis mensajes.' })).toEqual({ href: '/mensajes', label: 'Mensajes' });
  });

  it('una pantalla nombrada sin «¿dónde?» (para «¿cómo se usa Publicar?»), y las palabras que no cuentan', () => {
    expect(navTarget('como se usa publicar', ['social'])).toBeNull();
    expect(screenNamed('como se usa publicar', ['social'])?.href).toBe('/publicar');
    expect(screenNamed('hay tutoriales', ['social'])?.href).toBe('/ayuda');
    expect(screenNamed('hay tutoriales', ['social'], ['tutoriales'])).toBeNull();
  });
});
