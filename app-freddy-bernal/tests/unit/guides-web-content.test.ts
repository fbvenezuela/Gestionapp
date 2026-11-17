// The web's and Atención's guide as app data (WF-C, design §4(a)): src/lib/guides/web keeps the four docs (GUIA-WEB,
// MANUAL-ADMIN-WEB, MANUAL-ATENCION, FLUJOS-WEB) section by section, with the PDF's numbers, an audience from the scope
// table of §4(d), references by section id and the client's words as huecos. The guides' own rules (check.ts) hold here
// too: every «…» is the screen's (or the client's config's) text, no concrete date, hour or phone, no demo name, nothing
// internal; and src/lib/guides never writes the client's words (the repository is public).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { getClientConfig } from '@/lib/client-config';
import { WEB_ROLES, type Role } from '@/lib/roles';
import { DEMO_WORDS, LABEL_ALLOW, LABEL_PATTERNS, balancedQuotes, concreteDateTime, hasPhone, hasReceiptCode, quotedLabels } from '@/lib/guides/check';
import { docFill, flowLayout, wrapFits } from '@/lib/guides/render-web-md';
import {
  CLIENT_HUECOS,
  UNFILLED_HUECO,
  WEB_DOCS,
  WEB_GUIDE_ROWS,
  WEB_PARTS,
  clientWords,
  fillClientWords,
  fillWebText,
  pdfText,
  webDocOf,
  webEntry,
  webFacetTexts,
  webFlows,
  webGuideRows,
  webHref,
  webPageOf,
  webPartsOf,
  webRefs,
  webSections,
  webTexts,
} from '@/lib/guides/web';

const cfg = getClientConfig();
const words = clientWords(cfg);
const fill = (s: string) => fillClientWords(s, words);
const SECTIONS = webSections();
const FLOWS = webFlows();
const ALL = [...SECTIONS, ...FLOWS];

type Text = { where: string; text: string };
// Every text a person reads, with the client's words filled; the references stay as their marker («[§id]»), which the
// docs print as a number and «Ayuda y guías» as a link (a number like «4.13» would read as a date to the checks). Also
// what «Ayuda y guías» adds around them: each part's title and opening line, and the two rows of «La guía de cada persona».
const TEXTS: Text[] = [
  ...WEB_DOCS.map((d) => ({ where: `${d.id}: título`, text: fill(d.title) })),
  ...ALL.flatMap((x) => webTexts(x).map((text) => ({ where: `${x.pdf} ${x.id}`, text: fill(text) }))),
  ...WEB_PARTS.flatMap((p) => [p.title, p.lede].map((text) => ({ where: `parte ${p.n}`, text }))),
  ...WEB_GUIDE_ROWS.flatMap((r) => [r.label, r.detail].map((text) => ({ where: `fila ${r.href}`, text }))),
];
const FACETS: Text[] = ALL.flatMap((x) => webFacetTexts(x).map((text) => ({ where: `${x.pdf} ${x.id} (360)`, text: fill(text) })));

// The screens' text: src/ outside src/lib/guides, without comments (as guides-content.test.ts reads it), and the
// client's config, where the public texts live (the menu, the legal pages, the notices).
function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return p.startsWith(path.join('src', 'lib', 'guides')) ? [] : sourceFiles(p);
    return /\.(ts|tsx)$/.test(d.name) ? [p] : [];
  });
}
const withoutComments = (s: string) =>
  s
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/^\s*\/\/.*$/gm, ' ')
    .replace(/\s\/\/\s.*$/gm, ' ');
const SOURCE = sourceFiles('src')
  .map((f) => withoutComments(fs.readFileSync(f, 'utf8')))
  .join('\n')
  .replace(/\s+/g, ' ');
const strings = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []);
const CONFIG = strings(cfg).join('\n').replace(/\s+/g, ' ');
const labelFound = (l: string) => SOURCE.includes(l) || CONFIG.includes(l) || LABEL_PATTERNS.some((p) => p.re.test(l)) || LABEL_ALLOW.includes(l);

describe('la guía de la web como datos de la app (WF-C)', () => {
  it('cuatro documentos: GUIA-WEB, los dos manuales y los flujos, cada uno con su archivo y su título', () => {
    expect(WEB_DOCS.map((d) => d.file)).toEqual(['docs/GUIA-WEB.md', 'docs/MANUAL-ADMIN-WEB.md', 'docs/MANUAL-ATENCION.md', 'docs/FLUJOS-WEB.md']);
    for (const d of WEB_DOCS) expect(d.sections[0].heading, `${d.id}: la primera sección es la apertura`).toBeUndefined();
    expect(WEB_DOCS.filter((d) => d.flows).map((d) => d.id)).toEqual(['flujos-web']);
  });

  it('cada sección y cada flujo con su número del PDF, una sola vez: las siete partes completas', () => {
    const pdfs = ALL.map((x) => x.pdf);
    expect(new Set(pdfs).size).toBe(pdfs.length);
    const count = (n: number) => pdfs.filter((p) => p.startsWith(`${n}.`) && p !== `${n}.0`).length;
    // Part 1 (1.1-1.10), 2 (2.1-2.7), 3 (3.1-3.11), 4 (4.1-4.16), 5 (5.1-5.23), 6 (the 18 flows), 7 (7.1-7.8).
    expect([1, 2, 3, 4, 5, 6, 7].map(count)).toEqual([10, 7, 11, 16, 23, 18, 8]);
    for (const n of [1, 2, 3, 4, 5, 6, 7]) expect(pdfs, `apertura de la parte ${n}`).toContain(`${n}.0`);
    expect(WEB_PARTS.map((p) => p.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // In each doc, the numbers go up.
    for (const d of WEB_DOCS) {
      const nums = [...d.sections, ...(d.flows ?? [])].map((x) => x.pdf);
      if (d.id !== 'guia-web') expect([...nums].sort((a, b) => Number(a.split('.')[1]) - Number(b.split('.')[1]))).toEqual(nums);
    }
  });

  it('ids únicos entre secciones y flujos, sin palabras del cliente; los flujos con el ancla de su documento', () => {
    const ids = ALL.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SECTIONS) expect(s.id, s.pdf).toMatch(/^(?!flujo-web-)[a-z0-9]+(?:-[a-z0-9]+)*$/);
    for (const f of FLOWS) expect(f.id, f.pdf).toMatch(/^flujo-web-[a-z]+$/);
    expect(ids.filter((id) => /freddy|bernal/i.test(id))).toEqual([]);
  });

  it('cada sección con su público (jefe, administración o los dos), sin los roles de la web ni del equipo', () => {
    for (const x of ALL) for (const a of x.audience) expect(['boss', 'admin'], `${x.pdf}: ${a}`).toContain(a);
    // From the scope table (design §4(d)): the web is both's; what Administración never opens (a case, its contact, the
    // figures) is the boss's; what neither does (a contact, a denuncia, the export) is nobody's, and 360 says «No: …».
    const of = (pdf: string) => webEntry(pdf)!.audience;
    expect(of('4.8')).toEqual(['boss', 'admin']);
    expect(of('4.13')).toEqual(['boss', 'admin']);
    expect(of('5.5')).toEqual(['boss']);
    expect(of('5.15')).toEqual(['boss']);
    expect(of('5.21')).toEqual(['admin']);
    expect(of('5.19')).toEqual(['boss', 'admin']);
    for (const none of ['5.9', '5.13', '5.16', '6.3']) expect(of(none), none).toEqual([]);
    for (const r of WEB_ROLES) expect(ALL.some((x) => (x.audience as string[]).includes(r)), r).toBe(false);
  });

  it('cada referencia («[§id]») apunta a una sección o un flujo; GUIA-WEB, solo a sus capítulos', () => {
    let n = 0;
    for (const x of ALL) {
      const doc = webDocOf(x.id)!;
      for (const t of webTexts(x)) {
        for (const id of webRefs(t)) {
          n++;
          const to = webEntry(id);
          expect(to, `${x.pdf}: [§${id}]`).not.toBeNull();
          // GUIA-WEB.md writes its own chapters' numbers (1, 2, 3 = part 7, 4 = part 3 up to 3.8).
          if (doc.id === 'guia-web') expect(to!.pdf, `${x.pdf}: [§${id}]`).toMatch(/^(?:[127]\.\d+|3\.[1-8])$/);
        }
      }
    }
    expect(n).toBeGreaterThan(50);
    // A text ready to read gets the PDF's number, or what the caller asks.
    expect(fillWebText('ver [§aprobar]', words)).toBe('ver 4.8');
    expect(fillWebText('ver [§aprobar]', words, (id) => webEntry(id)!.title)).toBe(`ver ${webEntry('aprobar')!.title}`);
    // «Ayuda y guías» says the PDF's parts where GUIA-WEB.md names the manuals.
    expect(pdfText(webDocOf('inicio'), '(ver el manual de la web, punto 6)')).toBe(`(ver [§${webEntry('4.6')!.id}])`);
    expect(pdfText(webDocOf('aprobar'), '(ver el manual de la web, punto 6)')).toBe('(ver el manual de la web, punto 6)');
  });

  it('cada página de «Ayuda y guías» con sus partes; cada sección y flujo con su dirección', () => {
    expect(webPartsOf('web').map((v) => v.part.n)).toEqual([1, 2, 3, 4, 6, 7]);
    expect(webPartsOf('atencion').map((v) => v.part.n)).toEqual([5, 6]);
    // The flows: the desk's (6.1-6.11) in Atención, the web's (6.12-6.18) in La web.
    expect(webPartsOf('atencion').find((v) => v.part.n === 6)!.flows.map((f) => f.pdf)).toEqual(FLOWS.slice(0, 11).map((f) => f.pdf));
    expect(webPartsOf('web').find((v) => v.part.n === 6)!.flows.map((f) => f.pdf)).toEqual(FLOWS.slice(11).map((f) => f.pdf));
    for (const x of ALL) {
      const href = webHref(x.id)!;
      expect(href, x.pdf).toMatch(/^\/ayuda\/(?:web|atencion)(?:\?(?:parte=\d|flujo=flujo-web-[a-z]+)(?:#[a-z0-9-]+)?)?$/);
      expect(href.startsWith(`/ayuda/${webPageOf(x.pdf)}`), x.pdf).toBe(true);
    }
    expect(webHref('aprobar')).toBe('/ayuda/web?parte=4#aprobar');
    expect(webHref('5.12')).toBe('/ayuda/atencion?parte=5#casos-atendidos');
    expect(webHref('flujo-web-envio')).toBe('/ayuda/atencion?flujo=flujo-web-envio');
    expect(webHref('0.0')).toBe('/ayuda/web');
  });

  it('los flujos: cada arista une nodos que existen, cada pregunta tiene al menos dos salidas y el dibujo está al día', () => {
    expect(FLOWS).toHaveLength(18);
    for (const f of FLOWS) {
      const ids = new Set(f.nodes.map((n) => n.id));
      expect(ids.size, f.id).toBe(f.nodes.length);
      for (const e of f.edges) {
        expect(ids.has(e.from), `${f.id}: ${e.from}`).toBe(true);
        expect(ids.has(e.to), `${f.id}: ${e.to}`).toBe(true);
      }
      for (const n of f.nodes.filter((x) => x.shape === 'decision')) expect(f.edges.filter((e) => e.from === n.id).length, `${f.id}: ${n.id}`).toBeGreaterThanOrEqual(2);
      expect(f.who.length, f.id).toBeGreaterThan(10);
      expect(f.know.length, f.id).toBeGreaterThan(1);
      // The drawing's line order still covers every edge and writes every node once.
      expect(flowLayout(f), f.id).toBe(f.layout);
    }
  });

  it('cada corte guardado (wrap) cabe en su texto: quien cambia un texto borra su wrap', () => {
    let n = 0;
    for (const d of WEB_DOCS) {
      const printed = docFill(d, WEB_DOCS, words);
      d.sections.forEach((s, si) =>
        s.blocks.forEach((b, bi) => {
          const lead = si === 0 && bi === 0 && d.date ? `**${d.date}.** ` : '';
          const check = (t: string, w: number[] | undefined, where: string) => {
            if (!w) return;
            n++;
            expect(wrapFits(lead + printed(t), w), where).not.toBeNull();
          };
          if (b.kind === 'p') check(b.text, b.wrap, `${s.pdf} párrafo ${bi}`);
          if (b.kind === 'list' || b.kind === 'steps') b.items.forEach((t, i) => check(t, b.wrap?.[i], `${s.pdf} ${b.kind} ${bi}.${i}`));
          if (b.kind === 'note') b.paras.forEach((t, i) => check(t, b.wrap?.[i], `${s.pdf} nota ${bi}.${i}`));
        }),
      );
    }
    expect(n).toBeGreaterThan(30);
  });
});

describe('las reglas de las guías también en la web (check.ts)', () => {
  it('cada «» está cerrado', () => {
    expect(TEXTS.filter((t) => !balancedQuotes(t.text)).map((t) => `${t.where}: ${t.text}`)).toEqual([]);
  });

  it('cada etiqueta es un texto de la pantalla (src/ fuera de las guías) o de la configuración del cliente, o una contada o una permitida', () => {
    const missing = new Set<string>();
    for (const t of TEXTS) for (const l of quotedLabels(t.text)) if (!labelFound(l)) missing.add(`«${l}» (${t.where})`);
    expect([...missing]).toEqual([]);
  });

  it('ninguna fecha ni hora concreta, ningún teléfono, ningún nombre de la demo', () => {
    expect(TEXTS.filter((t) => concreteDateTime(t.text)).map((t) => `${t.where}: ${t.text}`)).toEqual([]);
    expect(TEXTS.filter((t) => hasPhone(t.text)).map((t) => `${t.where}: ${t.text}`)).toEqual([]);
    expect(TEXTS.flatMap((t) => DEMO_WORDS.filter((w) => t.text.includes(w)).map((w) => `${t.where}: ${w}`))).toEqual([]);
    // The edition date of each doc is apart (its first paragraph prints it): never a section's text.
    for (const d of WEB_DOCS) if (d.date) expect(SECTIONS.some((s) => webTexts(s).some((t) => t.includes(d.date!))), d.id).toBe(false);
  });

  it('una pantalla que solo parece una hora pasa («entre las dos fechas»); una hora de verdad no', () => {
    expect(concreteDateTime('Solicitudes que llegaron entre las dos fechas.')).toBe(false);
    expect(concreteDateTime('Avisa cada mañana, desde las 7:00 a. m.')).toBe(true);
    expect(concreteDateTime('Las dos columnas más nuevas.')).toBe(true);
  });

  it('nada interno: ni comandos, ni archivos, ni «base de datos», «servidor», «Supabase», «fase» ni decisiones; sin raya y «la app»', () => {
    const internal = /\bnpm\b|\.tsx?\b|\.md\b|\bsrc\/|base de datos|\bservidor|supabase|\bfase\b|\bD-\d+\b|la plataforma|—/i;
    expect(TEXTS.filter((t) => internal.test(t.text)).map((t) => `${t.where}: ${t.text}`)).toEqual([]);
  });

  it('los comprobantes de prueba (códigos y claves) solo en las secciones que los muestran para practicar', () => {
    const where = [...new Set(ALL.filter((x) => webTexts(x).some(hasReceiptCode)).map((x) => x.pdf))].sort();
    expect(where).toEqual(['2.3', '5.0', '5.22', '5.4', '7.5', '7.6']);
    expect(hasReceiptCode('«Solicitud vencida: AC-…»')).toBe(false);
    expect(hasReceiptCode('Busca AC-2026-K7')).toBe(true);
  });

  it('los campos de 360 siguen las mismas reglas: etiquetas de la pantalla, sin fechas, horas, teléfonos, códigos ni claves, nada interno, «tú»', () => {
    const bad: string[] = [];
    const internal = /\bnpm\b|\.tsx?\b|\.md\b|\bsrc\/|base de datos|\bservidor|supabase|\bfase\b|\bD-\d+\b|la plataforma|[—–]/i;
    for (const t of FACETS) {
      if (!balancedQuotes(t.text)) bad.push(`${t.where}: «» sin cerrar: ${t.text}`);
      for (const l of quotedLabels(t.text)) if (!labelFound(l)) bad.push(`${t.where}: «${l}»`);
      if (concreteDateTime(t.text) || hasPhone(t.text) || hasReceiptCode(t.text)) bad.push(`${t.where}: fecha, hora, teléfono o código: ${t.text}`);
      if (internal.test(t.text)) bad.push(`${t.where}: algo interno: ${t.text}`);
      for (const w of DEMO_WORDS) if (t.text.includes(w)) bad.push(`${t.where}: ${w}`);
      // 360 talks to the team with «tú»; «usted» only inside what it quotes from the citizen's screens, or as the name of
      // the register the web uses with the citizen («la web le habla de usted»). Never a reference marker.
      if (/\[§|\busted\b/i.test(t.text.replace(/«[^«»]*»/g, '').replace(/\bde usted\b/gi, ''))) bad.push(`${t.where}: ${t.text}`);
    }
    expect(bad).toEqual([]);
    expect(FACETS.length).toBeGreaterThan(1000);
  });
});

describe('las palabras del cliente salen de su configuración (el repositorio es público)', () => {
  const files = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? files(path.join(dir, d.name)) : [path.join(dir, d.name)]));

  it('ningún archivo de src/lib/guides escribe «freddy», «bernal», la web oficial ni el Semanario', () => {
    const hits = files(path.join('src', 'lib', 'guides')).filter((f) => /freddy|bernal|freddybernaloficial|informativo t[aá]chira/i.test(fs.readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });

  it('ningún archivo de src/lib/guides escribe una palabra del cliente que trae su configuración', () => {
    // The client's own words from config/clients/fb.json: its name and each part of it, its title, the program, the
    // paper, the official site, the organization and its office (the region alone is the app's: «hora del Táchira»).
    const b = cfg.brand;
    const sd = cfg.web.structuredData as { organizationName: string; jobTitle?: string };
    const own = [b.clientName, ...b.clientName.split(' '), b.clientTitle, b.programName, b.weeklyName, ...Object.values(words), sd.organizationName, sd.jobTitle ?? '']
      .map((w) => w.trim())
      .filter((w) => w.length > 3);
    expect(own).toContain(words.organization);
    const hits = files(path.join('src', 'lib', 'guides')).flatMap((f) => {
      const text = fs.readFileSync(f, 'utf8').toLowerCase();
      return own.filter((w) => text.includes(w.toLowerCase())).map((w) => `${f}: ${w}`);
    });
    expect(hits).toEqual([]);
  });

  it('los huecos se llenan con config/clients/fb.json: el nombre del programa en el menú de la web, el Semanario, la web oficial y la institución', () => {
    const menu = (cfg.web.settings as Record<string, unknown>)['site.navigation'] as { label: string; path: string }[];
    expect(words).toEqual({
      program: menu.find((n) => n.path === '/reporte-bernal')!.label,
      weekly: cfg.brand.weeklyName,
      officialSite: cfg.web.realSite.source,
      organization: cfg.web.structuredData.organizationName,
    });
    expect(fill(`${CLIENT_HUECOS.program} · ${CLIENT_HUECOS.weekly} · ${CLIENT_HUECOS.officialSite} · ${CLIENT_HUECOS.organization}`)).toBe(
      `${words.program} · ${words.weekly} · ${words.officialSite} · ${words.organization}`,
    );
    // The data uses them where the docs name the client: the program, the paper and the official site.
    const raw = ALL.flatMap((x) => webTexts(x)).join('\n');
    for (const h of Object.values(CLIENT_HUECOS)) expect(raw, h).toContain(h);
    // Nothing is left unfilled in what a person reads.
    for (const t of TEXTS) expect(t.text, t.where).not.toMatch(UNFILLED_HUECO);
  });
});

describe('«Ayuda y guías»: las dos guías de la web, solo para el jefe y administración', () => {
  it('las filas de «La guía de cada persona» por rol', () => {
    const rows = (roles: Role[]) => webGuideRows(roles).map((r) => r.href);
    expect(rows(['boss'])).toEqual(['/ayuda/web', '/ayuda/atencion']);
    expect(rows(['admin'])).toEqual(['/ayuda/web', '/ayuda/atencion']);
    expect(rows(['admin', 'writer'])).toEqual(['/ayuda/web', '/ayuda/atencion']);
    for (const r of ['dispatch', 'politics', 'ivt', 'camera', 'social', ...WEB_ROLES] as Role[]) expect(rows([r]), r).toEqual([]);
    expect(WEB_GUIDE_ROWS.map((r) => r.label)).toEqual(['La web', 'Atención ciudadana']);
  });
});
