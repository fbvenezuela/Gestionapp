// The repo's guides are generated from src/lib/guides (R3, D-42, design §7.5): docs/GUIA-POR-ROL.md, docs/FLUJOS.md and
// docs/GUIA-ADMINISTRACION.md must be exactly what the source renders, with «No se manda todavía…» on top, and the
// flows' Mermaid plain (no click, no styles). A guide edited by hand, or a source changed without its documents,
// fails here: run `npm run docs:guides`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_GUIDE, FLOWS, GLOSSARY, SHARED, TOURS, allGuides } from '@/lib/guides';
import { NOT_SENT, flowMermaid, renderAllDocs } from '@/lib/guides/render-md';

const docs = renderAllDocs({ shared: SHARED, guides: allGuides(), flows: FLOWS, tours: TOURS, admin: ADMIN_GUIDE });

describe('los documentos de las guías están al día', () => {
  for (const [file, text] of Object.entries(docs)) {
    it(`${file} es igual a lo que genera la fuente (si no: corre npm run docs:guides)`, () => {
      const onDisk = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(onDisk === text, `${file} no está al día: corre npm run docs:guides`).toBe(true);
    });

    it(`${file} dice arriba que no se manda todavía`, () => {
      expect(text.split('\n').slice(0, 4).join('\n')).toContain(NOT_SENT);
      expect(NOT_SENT).toContain(`No se manda todavía: ${'Hil' + 'lary'} pidió probar cada rol antes (25/10).`);
    });
  }

  it('la guía por rol trae «Para todos» con «Palabras de la app», los seis roles con sus partes y cómo probar en la demo', () => {
    const md = docs['docs/GUIA-POR-ROL.md'];
    expect(md).toContain('## Para todos');
    const words = md.slice(md.indexOf('### Palabras de la app\n'), md.indexOf('\n## ', md.indexOf('### Palabras de la app\n')));
    for (const g of GLOSSARY) expect(words, g.term).toContain(`- **${g.term}.** ${g.text}`);
    for (const g of allGuides()) {
      const part = md.slice(md.indexOf(`\n## ${g.label}\n`));
      expect(md, g.label).toContain(`\n## ${g.label}\n`);
      for (const h of ['### Tu trabajo', '### Tu día', '### Paso a paso', '### Cada sección de la app', '### Cómo pasa tu trabajo a los demás', '### Preguntas']) expect(part, `${g.label}: ${h}`).toContain(h);
    }
    expect(md).toContain('## Cómo probar en la demo');
    expect(md).not.toMatch(/administraci[oó]n:/i);
    // «Cómo sigue el trabajo:» under each task, and the tutorial's title as the screen says it.
    expect(md).toContain('Cómo sigue el trabajo: [');
    expect(md).not.toMatch(/^Flujo: /m);
    expect(md).toMatch(/Tutorial en la app: «[^»]+»/);
  });

  it('los flujos dicen a qué paso vuelve una rama y en qué flujo sigue un paso', () => {
    const md = docs['docs/FLUJOS.md'];
    expect(md).toContain('- No → Le sigue dando seguimiento. Vuelve al paso 4.');
    expect(md).toContain('- No → «Guardar borrador»: todavía no le llega al jefe. La completa después. Vuelve a este paso.');
    expect(md).toContain('La aprobación, con el semáforo. Sigue en el flujo [El semáforo](#flujo-aprobacion).');
  });

  it('los flujos van en Mermaid sencillo, uno por flujo, con su ancla', () => {
    const md = docs['docs/FLUJOS.md'];
    expect(md.match(/```mermaid\nflowchart TD\n/g)?.length).toBe(FLOWS.length);
    for (const f of FLOWS) {
      expect(md).toContain(`<a id="flujo-${f.id}"></a>`);
      const m = flowMermaid(f);
      expect(m).not.toMatch(/\bclick\b|\bstyle\b|classDef|<[a-z]/i);
      // Every node label is quoted, and nothing inside breaks the quotes.
      for (const line of m.split('\n').slice(1)) expect(line, line).toMatch(/^ {2}[A-Za-z0-9_]+(?:\["[^"]*"\]|\{"[^"]*"\})?(?: (?:-->|-- [\p{L}\p{N} ,]+ -->) [A-Za-z0-9_]+(?:\["[^"]*"\]|\{"[^"]*"\})?)?$/u);
    }
  });
});
