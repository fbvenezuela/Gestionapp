// The repo's guides are generated from src/lib/guides (R3, D-42, design §7.5): docs/GUIA-POR-ROL.md, docs/FLUJOS.md and
// docs/GUIA-ADMINISTRACION.md must be exactly what the source renders, with «No se manda todavía…» on top, and the
// flows' Mermaid plain (no click, no styles). A guide edited by hand, or a source changed without its documents,
// fails here: run `npm run docs:guides`.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_GUIDE, FLOWS, GLOSSARY, SHARED, TOURS, allGuides } from '@/lib/guides';
import { NOT_SENT, flowMermaid, renderAllDocs } from '@/lib/guides/render-md';
import { greedyLines, renderWebDocs, webFlowMermaid, wrapFits } from '@/lib/guides/render-web-md';
import { UNFILLED_HUECO, WEB_DOCS, clientWords, fillClientWords, webFlows } from '@/lib/guides/web';

const docs = renderAllDocs({ shared: SHARED, guides: allGuides(), flows: FLOWS, tours: TOURS, admin: ADMIN_GUIDE });
const words = clientWords();
const webDocs = renderWebDocs(WEB_DOCS, words);

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

// The web's and Atención's guide (WF-C): docs/GUIA-WEB.md, MANUAL-ADMIN-WEB.md, MANUAL-ATENCION.md and FLUJOS-WEB.md
// come out of src/lib/guides/web, byte for byte what is committed (the port gave the hand-written docs back unchanged
// but for the line that says they are generated); each doc keeps its own numbers, and the client's words come from its
// config, never from the code.
describe('las guías de la web están al día (WF-C)', () => {
  it('son los cuatro documentos de la web, en su orden', () => {
    expect(Object.keys(webDocs)).toEqual(['docs/GUIA-WEB.md', 'docs/MANUAL-ADMIN-WEB.md', 'docs/MANUAL-ATENCION.md', 'docs/FLUJOS-WEB.md']);
  });

  for (const [file, text] of Object.entries(webDocs)) {
    it(`${file} es igual a lo que genera src/lib/guides/web (si no: corre npm run docs:guides)`, () => {
      const onDisk = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(onDisk === text, `${file} no está al día: corre npm run docs:guides`).toBe(true);
    });

    it(`${file} dice arriba que se genera, y sin huecos ni marcas`, () => {
      expect(text.split('\n').slice(0, 6).join('\n')).toContain('<!-- Generado por `npm run docs:guides` desde src/lib/guides/web/');
      expect(text).not.toMatch(UNFILLED_HUECO);
      expect(text).not.toContain('[§');
    });
  }

  it('cada documento escribe sus números: GUIA-WEB los suyos, los manuales y los flujos los de la guía en PDF', () => {
    const guia = webDocs['docs/GUIA-WEB.md'];
    expect(guia).toContain('\n## 1. La web, sección por sección\n');
    expect(guia).toContain('\n### 1.1 Inicio\n');
    // «La versión de prueba» is its chapter 3 (part 7 in the PDF): «(ver 3.1)».
    expect(guia).toContain('una **versión de prueba** (ver 3.1)');
    const web = webDocs['docs/MANUAL-ADMIN-WEB.md'];
    expect(web).toContain('\n## 13. Ajustes del sitio\n');
    expect(web).toContain('(ver 7.1)');
    expect(webDocs['docs/FLUJOS-WEB.md']).toContain('(ver 6.18)');
    // The edition date opens the first paragraph.
    for (const f of ['docs/GUIA-WEB.md', 'docs/MANUAL-ADMIN-WEB.md', 'docs/MANUAL-ATENCION.md']) expect(webDocs[f], f).toMatch(/^# .+\n\n<!-- .+ -->\n\*\*\d{2}\/\d{2}\/\d{4}\.\*\* /);
  });

  it('las palabras del cliente salen de su configuración: el programa, el Semanario, la web oficial y la institución', () => {
    const all = Object.values(webDocs).join('\n');
    for (const w of Object.values(words)) expect(all, w).toContain(w);
    // Another client's words go in their place.
    const other = renderWebDocs(WEB_DOCS, { program: 'Programa de prueba', weekly: 'Semanario de prueba', officialSite: 'web-de-prueba.test', organization: 'Institución de prueba' });
    const theirs = Object.values(other).join('\n');
    for (const w of Object.values(words)) expect(theirs, w).not.toContain(w);
    expect(theirs).toContain('«Programa de prueba»');
    expect(theirs).toContain('«Comprobante · Atención ciudadana · Institución de prueba»');
  });

  it('los flujos van en el Mermaid de siempre, uno por flujo, con su ancla y su lista arriba', () => {
    const md = webDocs['docs/FLUJOS-WEB.md'];
    const flows = webFlows();
    const fill = (s: string) => fillClientWords(s, words);
    expect(md.match(/```mermaid\nflowchart TD\n/g)?.length).toBe(flows.length);
    for (const f of flows) {
      expect(md).toContain(`- [${fill(f.title)}](#${f.id})`);
      expect(md).toContain(`<a id="${f.id}"></a>`);
      expect(md).toContain(webFlowMermaid(f, fill));
    }
    // A flow changed without its line order still draws: each node written once, in full.
    const f = { ...flows[0], layout: undefined };
    const m = webFlowMermaid(f);
    for (const n of f.nodes) expect(m.split('\n').filter((l) => new RegExp(`\\b${n.id}[\\[({]"`).test(l)), n.id).toHaveLength(1);
  });

  it('el corte de las líneas: lo que cabe en el ancho, o el corte guardado si todavía cabe en su texto', () => {
    expect(greedyLines('uno dos tres cuatro', 9, '- ', '  ')).toEqual(['- uno dos', '  tres', '  cuatro']);
    expect(greedyLines('uno dos tres cuatro', null, '', '')).toEqual(['uno dos tres cuatro']);
    expect(wrapFits('uno dos tres', [7, 4])).toEqual(['uno dos', 'tres']);
    // A text that changed under its wrap: the wrap no longer fits (the renderer goes back to the greedy cut).
    expect(wrapFits('uno dos tres!', [7, 4])).toBeNull();
    expect(wrapFits('uno dos tres', [5, 6])).toBeNull();
  });
});
