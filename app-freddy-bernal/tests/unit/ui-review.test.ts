import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { QUICK_REASONS, hasReason, toggleReason } from '@/lib/domain/review-reasons';
import { copyPreview, type SpecRow } from '@/lib/domain/copy-preview';
import { noPermissionUrl } from '@/components/shell/no-permission';
import { homeFor } from '@/lib/roles';

describe('pedir cambios: motivos rápidos', () => {
  it('están los siete motivos pedidos', () => {
    expect([...QUICK_REASONS]).toEqual(['Muy largo', 'Falta la fuente de una cifra', 'Revisar ortografía', 'Cambiar la portada', 'Subtítulos', 'Se oye bajo', 'Dice fecha u hora']);
  });

  it('un toque agrega la frase al comentario y otro la quita', () => {
    let c = toggleReason('', 'Muy largo');
    expect(c).toBe('Muy largo.');
    c = toggleReason(c, 'Se oye bajo');
    expect(c).toBe('Muy largo. Se oye bajo.');
    expect(hasReason(c, 'Se oye bajo')).toBe(true);
    c = toggleReason(c, 'Muy largo');
    expect(c).toBe('Se oye bajo.');
    expect(hasReason(c, 'Muy largo')).toBe(false);
    c = toggleReason(c, 'Se oye bajo');
    expect(c).toBe('');
  });

  it('respeta lo que la persona ya escribió', () => {
    expect(toggleReason('El final se corta', 'Subtítulos')).toBe('El final se corta. Subtítulos.');
    expect(toggleReason('¿Esto es así?', 'Subtítulos')).toBe('¿Esto es así? Subtítulos.');
    expect(toggleReason('[0:12] Revisar   ', 'Muy largo')).toBe('[0:12] Revisar. Muy largo.');
    const mid = 'A. Dice fecha u hora. B.';
    expect(toggleReason(mid, 'Dice fecha u hora')).toBe('A. B.');
    expect(toggleReason('Línea uno\nMuy largo.', 'Muy largo')).toBe('Línea uno');
    // A sentence that merely contains the words is not the chip.
    expect(hasReason('No es muy largo.', 'Muy largo')).toBe(false);
  });
});

describe('revisión: cómo saldrá cada copy', () => {
  const specs: SpecRow[] = [
    { network: 'instagram', label: 'Instagram', copy_max_chars: 2200, length_group: 'long' },
    { network: 'facebook', label: 'Facebook', copy_max_chars: 63206, length_group: 'long' },
    { network: 'youtube', label: 'YouTube', copy_max_chars: 5000, length_group: 'long' },
    { network: 'threads', label: 'Threads', copy_max_chars: 500, length_group: 'medium' },
    { network: 'x', label: 'X', copy_max_chars: 280, length_group: 'short' },
  ];

  it('agrupa las redes por largo con su máximo y avisa dónde se pasa', () => {
    const long = 'a'.repeat(2300);
    const p = copyPreview([{ length_group: 'long', body: long }, { length_group: 'short', body: 'Hola' }], specs);
    expect(p.map((g) => g.group)).toEqual(['long', 'medium', 'short']);
    expect(p[0].networks.map((n) => [n.label, n.max, n.over])).toEqual([['Instagram', 2200, 100], ['YouTube', 5000, 0], ['Facebook', 63206, 0]]);
    expect(p[1]).toMatchObject({ body: '', length: 0, networks: [{ label: 'Threads', over: 0 }] });
    expect(p[2]).toMatchObject({ length: 4, networks: [{ label: 'X', max: 280, over: 0 }] });
  });

  it('en X cuenta como X (un enlace pesa 23)', () => {
    const p = copyPreview([{ length_group: 'short', body: `${'b'.repeat(260)} https://example.com/una/ruta/muy/larga/de/verdad` }], specs);
    expect(p[2].length).toBe(260 + 1 + 23);
    expect(p[2].networks[0].over).toBe(4);
  });
});

describe('pantallas que no son del rol', () => {
  it('lleva a cada quien a su inicio con el aviso', () => {
    expect(noPermissionUrl(homeFor(['boss']))).toBe('/jefe?sin-permiso=1');
    expect(noPermissionUrl(homeFor(['camera']))).toBe('/hoy?sin-permiso=1');
    expect(noPermissionUrl(homeFor(['boss', 'admin']))).toBe('/hoy?sin-permiso=1');
    expect(noPermissionUrl('/hoy?x=1')).toBe('/hoy?x=1&sin-permiso=1');
  });
  it('requireRole ya no manda a todos a /hoy y el aviso está montado en el panel', () => {
    const session = fs.readFileSync(path.join(process.cwd(), 'src/lib/auth/session.ts'), 'utf8');
    expect(session).toContain('redirect(noPermissionUrl(homeFor(s.roles)))');
    expect(session).not.toContain("redirect('/hoy')");
    expect(fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)/layout.tsx'), 'utf8')).toContain('<NoPermissionBanner />');
    expect(fs.readFileSync(path.join(process.cwd(), 'src/components/shell/no-permission-banner.tsx'), 'utf8')).toContain('Esa pantalla no es de tu rol.');
  });
});

describe('sin ventanas nativas del navegador', () => {
  it('no quedan confirm() ni alert() en revisión, aprobar y copies', () => {
    for (const f of ['src/app/(panel)/aprobar/[id]/review-room.tsx', 'src/app/(panel)/aprobar/approve-green.tsx', 'src/app/(panel)/piezas/[id]/copies-editor.tsx']) {
      const code = fs.readFileSync(path.join(process.cwd(), f), 'utf8');
      // The native ones take a string; useConfirm's confirm takes an options object.
      expect(code, f).not.toMatch(/(^|[^.\w])(window\.)?(confirm|alert)\(\s*['"`]/m);
      if (!f.endsWith('review-room.tsx')) expect(code, f).toContain('useConfirm()');
    }
  });
});

describe('resultados en el teléfono', () => {
  it('tarjetas bajo 640 px y nunca un enlace a «#»', () => {
    const code = fs.readFileSync(path.join(process.cwd(), 'src/app/(panel)/resultados/page.tsx'), 'utf8');
    expect(code).toContain('sm:hidden');
    expect(code).toContain('hidden sm:block');
    expect(code).not.toMatch(/['"]#['"]/);
    expect(code).toMatch(/target="_blank" rel="noreferrer"/);
  });
});
