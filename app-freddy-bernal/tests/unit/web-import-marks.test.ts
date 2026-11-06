// What the importer of the old site leaves for a person to finish (src/lib/web/import-marks.ts): the placeholder of a
// photo's alternative text and the marks where it took out personal data. The editor's «falta esto» says it, and the
// database refuses to publish it with the same words (20261106300100_web_importador.sql): this checks both agree.
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { ALT_PLACEHOLDER, ALT_PLACEHOLDER_PREFIX, REMOVED_MARKS, REVIEW_FLAGS, isAltPlaceholder, marksText, removedMarksIn, reviewFlagTexts } from '@/lib/web/import-marks';
import { draftProblems, readinessIssues } from '@/lib/web/cms/drafts';
import { goneWhenMissing, legacyPlan, lookupKeys } from '@/lib/web/redirects';

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase', 'migrations', '20261106300100_web_importador.sql'), 'utf8');

describe('las marcas del importador', () => {
  it('la base usa las mismas palabras que la app', () => {
    expect(migration).toContain(`left(btrim(coalesce(m.value ->> 'alt', '')), ${ALT_PLACEHOLDER_PREFIX.length}) = '${ALT_PLACEHOLDER_PREFIX}'`);
    for (const mark of Object.values(REMOVED_MARKS)) expect(migration).toContain(`strpos(v_text, '${mark}')`);
    expect(ALT_PLACEHOLDER.startsWith(ALT_PLACEHOLDER_PREFIX)).toBe(true);
    // The database asks 3 letters at least and 300 at most of every image's alternative text.
    expect(ALT_PLACEHOLDER.length).toBeGreaterThanOrEqual(3);
    expect(ALT_PLACEHOLDER.length).toBeLessThanOrEqual(300);
  });

  it('se encuentran a cualquier profundidad del borrador y se dicen en palabras', () => {
    expect(isAltPlaceholder(`  ${ALT_PLACEHOLDER}`)).toBe(true);
    expect(isAltPlaceholder('Una plaza (prueba)')).toBe(false);
    expect(removedMarksIn({ body: [{ type: 'paragraph', runs: [{ text: `escribe a ${REMOVED_MARKS.email}` }] }], title: REMOVED_MARKS.id })).toEqual(['email', 'id']);
    expect(removedMarksIn({ title: 'Nada que ver [sic]' })).toEqual([]);
    expect(marksText(['email', 'phone', 'id'])).toBe('«[correo retirado]», «[teléfono retirado]» y «[cédula retirada]»');
    // What the editor says of an imported draft: the flags it knows, in words; an unknown one is left out.
    expect(reviewFlagTexts(['alt_missing', 'otra-cosa', 'email_removed'])).toEqual([REVIEW_FLAGS.alt_missing, REVIEW_FLAGS.email_removed]);
  });

  it('un borrador con una marca no se puede enviar ni publicar desde el editor', () => {
    const draft = { title: 'Nota (prueba)', category: 'noticia', body: [{ type: 'paragraph', text: `Llamar al ${REMOVED_MARKS.phone}.` }] };
    expect(readinessIssues('news', draft)).toEqual([{ path: '', message: 'Quedó «[teléfono retirado]» donde el importador quitó un dato personal: reescribe esa frase.' }]);
    expect(draftProblems('news', draft)).toHaveLength(1);
    expect(draftProblems('news', { ...draft, body: [{ type: 'paragraph', text: 'Llamar a la oficina.' }] })).toEqual([]);
  });
});

describe('las direcciones viejas de las fotos', () => {
  it('un tamaño de WordPress o el %xx en mayúsculas encuentran la redirección del original', () => {
    expect(lookupKeys('/wp-content/uploads/2026/03/foto-1024x683.jpg')).toEqual([
      '/wp-content/uploads/2026/03/foto-1024x683.jpg', '/wp-content/uploads/2026/03/foto-1024x683.jpg/', '/wp-content/uploads/2026/03/foto.jpg', '/wp-content/uploads/2026/03/foto.jpg/',
    ]);
    expect(lookupKeys('/wp-content/uploads/2026/03/foto-scaled.jpg')).toContain('/wp-content/uploads/2026/03/foto.jpg');
    expect(lookupKeys('/2026/03/se%C3%B1al')).toContain('/2026/03/se%c3%b1al');
    // An article's address keeps its numbers (only uploads lose a size).
    expect(lookupKeys('/2026/03/nota-1024x683')).toEqual(['/2026/03/nota-1024x683', '/2026/03/nota-1024x683/']);
  });

  it('las páginas de una lista y el feed de una página de WordPress se buscan como esa página', () => {
    const plan = (url: string) => {
      const u = new URL(url, 'https://sitio.test');
      return legacyPlan(u.pathname, u.searchParams);
    };
    expect(plan('/categoria/salud/page/3/')).toEqual({ kind: 'lookup', path: '/categoria/salud' });
    expect(plan('/tag/agua/page/2')).toEqual({ kind: 'lookup', path: '/tag/agua' });
    expect(plan('/2026/03/una-nota/feed/')).toEqual({ kind: 'lookup', path: '/2026/03/una-nota' });
    expect(plan('/page/7/')).toEqual({ kind: 'search', to: '/actualidad' });
    expect(plan('/feed/')).toEqual({ kind: 'lookup', path: '/feed' });
    expect(plan('/2026/03/pagina-de-una-nota')).toEqual({ kind: 'lookup', path: '/2026/03/pagina-de-una-nota' });
  });

  it('un archivo viejo que no se trajo es 410; lo demás, 404', () => {
    expect(goneWhenMissing('/wp-content/uploads/2020/01/foto.jpg')).toBe(true);
    expect(goneWhenMissing('/wp-content/themes/viejo/estilo.css')).toBe(true);
    expect(goneWhenMissing('/2026/03/una-nota')).toBe(false);
    expect(goneWhenMissing('/tag/agua')).toBe(false);
  });
});
