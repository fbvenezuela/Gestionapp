// «Subir un PDF» says the limit the server applies (APP-11): on the hosting every file goes up to 4 MB, and the hint
// said «Hasta 20 MB.». The limit comes from the server (src/app/(panel)/admin/web/layout.tsx, maxMediaBytes); without
// it, the form says the smallest one. All data here is invented.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { UploadForm, UploadLimits } from '@/components/cms/upload-form';
import { maxMediaBytes } from '@/lib/web/cms/media-file';
import AdminWebLayout from '@/app/(panel)/admin/web/layout';

const MB = 1024 * 1024;
const form = (kind: 'image' | 'document') => h(UploadForm, { kind, onUploaded: () => {} });
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('el límite que dice «Subir un PDF»', () => {
  it('dice el límite que le pasa el servidor', () => {
    expect(text(renderToStaticMarkup(h(UploadLimits, { value: { image: 4 * MB, document: 4 * MB }, children: form('document') })))).toContain('Hasta 4 MB.');
    expect(text(renderToStaticMarkup(h(UploadLimits, { value: { image: 10 * MB, document: 20 * MB }, children: form('document') })))).toContain('Hasta 20 MB.');
  });

  it('sin el límite del servidor dice el más chico, nunca más de lo que se acepta', () => {
    expect(text(renderToStaticMarkup(form('document')))).toContain('Hasta 4 MB.');
  });

  it('el límite del servidor es el de maxMediaBytes: 4 MB en el hosting, 20 MB fuera de él', () => {
    expect(maxMediaBytes('document', '1')).toBe(4 * MB);
    expect(maxMediaBytes('document', undefined)).toBe(20 * MB);
    const html = text(renderToStaticMarkup(h(AdminWebLayout, { children: form('document') })));
    expect(html).toContain(`Hasta ${Math.round(maxMediaBytes('document') / MB)} MB.`);
  });

  it('la foto: se achica en este teléfono o computadora (el «equipo» es la gente)', () => {
    const html = text(renderToStaticMarkup(form('image')));
    expect(html).toContain('antes de salir de este teléfono o computadora.');
    expect(html).not.toMatch(/este equipo|MB/);
  });
});
