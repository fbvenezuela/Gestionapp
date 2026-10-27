// The small picture of a file in the material list and in Biblioteca comes from /api/media/<id>/thumb for every
// storage (the one made in the phone at upload time), not only for Google Drive. A file without one shows its icon
// (the route answers 404 and MediaThumb falls back). Demo ids only.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MediaRow } from '@/app/(panel)/eventos/[id]/material-panel';

const row = (over: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-0000000000a1', kind: 'storyboard', label: 'Storyboard (demo)', size_bytes: 120_000, duration_s: null,
  width: 1080, height: 1920, status: 'ready', mime: 'image/jpeg', bucket: 'media', lock: null, ...over,
});
const html = (over: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(MediaRow, { m: row(over), canRemove: false }));

describe('miniaturas del material, en cualquier almacenamiento', () => {
  it('una foto o un video listos muestran su miniatura aunque no estén en Drive', () => {
    for (const mime of ['image/jpeg', 'image/png', 'video/mp4']) {
      expect(html({ mime }), mime).toContain('src="/api/media/00000000-0000-4000-8000-0000000000a1/thumb"');
    }
    expect(html({ bucket: 'drive', mime: 'application/pdf' })).toContain('/thumb"');
  });

  it('lo que todavía se sube, o un audio o PDF fuera de Drive, muestran el ícono', () => {
    expect(html({ status: 'uploading' })).not.toContain('/thumb"');
    expect(html({ mime: 'audio/mpeg' })).not.toContain('/thumb"');
    expect(html({ mime: 'application/pdf' })).not.toContain('/thumb"');
  });

  it('Biblioteca ya no pide que el archivo esté en Drive para mostrar la miniatura', () => {
    const src = fs.readFileSync(path.resolve(import.meta.dirname, '../../src/app/(panel)/biblioteca/page.tsx'), 'utf8');
    const line = src.split('\n').find((l) => l.includes('const thumbs = '))!;
    expect(line).toMatch(/image\|video/);
    expect(src).toContain('<MediaThumb key={m.id} ids={[m.id]}');
  });
});
