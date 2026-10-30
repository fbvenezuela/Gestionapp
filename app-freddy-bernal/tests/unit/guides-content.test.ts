// The guides' content keeps its rules (R3, D-42, design §7.2, U16, U17): every screen a role opens has its section,
// every «…» is a label that exists on a screen (or a counted one, or a chip built in code), no concrete date or
// time, no phone, no demo name, Administración only in Mensajes' notice and 360's line, and Mensajes explained the
// same way in every guide. A guide that drifts from the screens fails here, not in front of the team.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SCREENS, canOpen, screenFor } from '@/lib/assistant/screens';
import { TEAM_ROLES, type TeamRole } from '@/lib/roles';
import { ADMIN_GUIDE, FLOWS, SHARED, TOURS, allGuides, guideFor, sectionCards } from '@/lib/guides';
import {
  DEMO_WORDS,
  LABEL_ALLOW,
  LABEL_PATTERNS,
  balancedQuotes,
  concreteDateTime,
  hasPhone,
  quotedLabels,
} from '@/lib/guides/check';
import { ADMIN_MENTIONS, MSG_AGENDA, MSG_ENTER, MSG_FREE, MSG_PHONES, MSG_RELATIVE, MSG_RULES } from '@/lib/guides/shared';
import { CHAT_COMPOSER_LINE, CHAT_NOTICE, CHAT_NOTICE_LINE } from '@/lib/domain/chat';
import type { RoleGuide, TourText } from '@/lib/guides';

// ── Every text of the help content, with where it is ───────────────────────────────────────────────────────────────

type Text = { where: string; text: string };

function guideTexts(g: RoleGuide): Text[] {
  const w = (s: string) => `${g.slug}: ${s}`;
  return [
    { where: w('misión'), text: g.job.mission },
    ...g.job.responsibilities.map((text, i) => ({ where: w(`responsabilidad ${i + 1}`), text })),
    ...g.job.never.map((text, i) => ({ where: w(`nunca ${i + 1}`), text })),
    ...g.job.worksWith.map((x) => ({ where: w(`con ${x.role}`), text: x.what })),
    ...g.job.rhythm.map((text, i) => ({ where: w(`ritmo ${i + 1}`), text })),
    ...g.day.map((text, i) => ({ where: w(`día ${i + 1}`), text })),
    ...g.tasks.flatMap((t) => [t.title, t.when, ...t.steps].map((text) => ({ where: w(`tarea ${t.id}`), text }))),
    ...g.sections.flatMap((s) => [s.menu, s.title, s.what, ...s.youDo, ...(s.cannot ?? [])].map((text) => ({ where: w(`pantalla ${s.screen}`), text }))),
    ...g.faq.flatMap((f) => [f.q, f.a].map((text) => ({ where: w('preguntas'), text }))),
  ];
}

const bodies = (b: TourText) => (typeof b === 'string' ? [b] : Object.values(b));

const TEAM_TEXTS: Text[] = [
  ...SHARED.flatMap((t) => [t.title, ...t.body].map((text) => ({ where: `para todos: ${t.id}`, text }))),
  ...allGuides().flatMap(guideTexts),
  ...FLOWS.flatMap((f) => [f.title, ...f.steps.flatMap((s) => [s.text, s.question ?? '', ...(s.branches ?? []).flatMap((b) => [b.label, b.text])])].filter(Boolean).map((text) => ({ where: `flujo ${f.id}`, text }))),
];
const TOUR_TEXTS: Text[] = TOURS.flatMap((t) => [t.title, ...t.steps.flatMap((s) => [s.title, ...bodies(s.body)])].map((text) => ({ where: `tutorial ${t.id}`, text })));
const ADMIN_TEXTS: Text[] = [
  { where: 'administración: misión', text: ADMIN_GUIDE.mission },
  ...ADMIN_GUIDE.sections.flatMap((s) => [s.title, s.what, ...s.youDo, ...(s.cannot ?? [])].map((text) => ({ where: `administración: ${s.title}`, text }))),
  ...ADMIN_GUIDE.notes.map((text) => ({ where: 'administración: notas', text })),
  ...ADMIN_GUIDE.faq.flatMap((f) => [f.q, f.a].map((text) => ({ where: 'administración: preguntas', text }))),
];
const ALL_TEXTS = [...TEAM_TEXTS, ...TOUR_TEXTS, ...ADMIN_TEXTS];

// ── The screens' text: src/ outside src/lib/guides, without comments ───────────────────────────────────────────────

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

const labelFound = (label: string) =>
  SOURCE.includes(label) || LABEL_PATTERNS.some((p) => p.re.test(label)) || LABEL_ALLOW.includes(label);

describe('las etiquetas «…» existen en las pantallas (U16)', () => {
  it('cada «» de guías y tutoriales está cerrado', () => {
    const open = ALL_TEXTS.filter((t) => !balancedQuotes(t.text)).map((t) => `${t.where}: ${t.text}`);
    expect(open).toEqual([]);
  });

  it('cada etiqueta existe como texto en src/ (fuera de src/lib/guides), o es una contada o un chip armado en código', () => {
    const missing = new Set<string>();
    for (const t of ALL_TEXTS) for (const l of quotedLabels(t.text)) if (!labelFound(l)) missing.add(`«${l}» (${t.where})`);
    expect([...missing]).toEqual([]);
  });

  it('los patrones de las contadas siguen armándose en el código', () => {
    for (const p of LABEL_PATTERNS) expect(SOURCE.includes(p.source), p.source).toBe(true);
  });
});

describe('sin datos concretos (U17)', () => {
  it('ninguna fecha con número, hora, «a las N» ni mapa', () => {
    const hits = ALL_TEXTS.filter((t) => concreteDateTime(t.text)).map((t) => `${t.where}: ${t.text}`);
    expect(hits).toEqual([]);
  });

  it('ningún teléfono', () => {
    const hits = ALL_TEXTS.filter((t) => hasPhone(t.text)).map((t) => `${t.where}: ${t.text}`);
    expect(hits).toEqual([]);
  });

  it('ningún nombre ni lugar de la demo', () => {
    const hits = ALL_TEXTS.flatMap((t) => DEMO_WORDS.filter((w) => t.text.includes(w)).map((w) => `${t.where}: ${w}`));
    expect(hits).toEqual([]);
  });

  it('sin los roles retirados', () => {
    const hits = ALL_TEXTS.filter((t) => /secretar[ií]a|supervisi[oó]n|secretary|supervisor/i.test(t.text)).map((t) => t.where);
    expect(hits).toEqual([]);
  });

  it('las guías del equipo nombran a administración solo en el aviso de Mensajes y en la línea de 360 (D-43)', () => {
    const hits = [...TEAM_TEXTS, ...TOUR_TEXTS.filter((t) => t.where !== 'tutorial mensajes')].filter((t) => {
      let rest = t.text;
      for (const m of ADMIN_MENTIONS) rest = rest.replace(m, ' ');
      return /administraci[oó]n|\badmin\b/i.test(rest);
    });
    expect(hits.map((t) => `${t.where}: ${t.text}`)).toEqual([]);
  });
});

describe('cada pantalla de cada rol tiene su sección', () => {
  for (const role of TEAM_ROLES) {
    const g = guideFor(role);
    it(`${g.label}: las secciones son pantallas que su rol abre`, () => {
      for (const s of g.sections) {
        expect(screenFor(s.screen), `${s.screen} no está en SCREENS`).not.toBeNull();
        expect(canOpen(s.screen, [role]), `${s.screen} no abre para ${role}`).toBe(true);
      }
    });

    it(`${g.label}: cada pantalla sin [id] que abre (salvo Ajustes) tiene su sección, y las importantes con [id] también`, () => {
      const have = new Set(g.sections.map((s) => screenFor(s.screen)!.href));
      const want = SCREENS.filter((s) => !s.href.includes('[') && !s.href.startsWith('/ajustes') && canOpen(s.href, [role])).map((s) => s.href);
      const important: Record<TeamRole, string[]> = {
        boss: ['/eventos/[id]', '/piezas/[id]', '/aprobar/[id]', '/obras/[id]', '/reportes/[id]', '/publicar/[id]', '/tweets/[id]', '/mensajes/[id]'],
        dispatch: ['/eventos/[id]', '/obras/[id]', '/reportes/[id]', '/mensajes/[id]'],
        politics: ['/eventos/[id]', '/reportes/[id]', '/mensajes/[id]'],
        ivt: ['/eventos/[id]', '/obras/[id]', '/mensajes/[id]'],
        camera: ['/eventos/[id]', '/mensajes/[id]'],
        social: ['/eventos/[id]', '/piezas/[id]', '/publicar/[id]', '/tweets/[id]', '/mensajes/[id]'],
      };
      expect([...want, ...important[role]].filter((h) => !have.has(h))).toEqual([]);
    });

    it(`${g.label}: tutoriales y flujos que existen; slug y cuenta`, () => {
      const tourIds = new Set(TOURS.map((t) => t.id));
      for (const s of g.sections) if (s.tour) expect(tourIds.has(s.tour), `${s.screen}: ${s.tour}`).toBe(true);
      for (const t of g.tasks) {
        if (t.tour) expect(tourIds.has(t.tour), `${t.id}: ${t.tour}`).toBe(true);
        if (t.flow) expect(FLOWS.some((f) => f.id === t.flow), `${t.id}: ${t.flow}`).toBe(true);
        expect(t.steps.length, t.id).toBeGreaterThan(0);
      }
      for (const f of g.flows) expect(FLOWS.find((x) => x.id === f)?.roles, f).toContain(role);
      // The tutorial of a section is one of this role's, for that screen.
      for (const s of g.sections) {
        if (!s.tour) continue;
        const t = TOURS.find((x) => x.id === s.tour)!;
        expect(t.roles, `${s.screen}: ${t.id}`).toContain(role);
        expect(t.screen.split('?')[0], `${s.screen}: ${t.id}`).toBe(s.screen.split('?')[0]);
      }
      expect(canOpen(g.account.home, [role])).toBe(true);
      expect(g.account.menu.length).toBeGreaterThan(0);
      expect(g.job.responsibilities.length).toBeGreaterThan(2);
      expect(g.day.length).toBeGreaterThan(2);
      expect(g.faq.length).toBeGreaterThan(2);
      expect(g.tasks.length).toBeGreaterThan(2);
    });
  }

  it('cada tutorial (salvo bienvenida, que va en el inicio) tiene su sección en la guía de cada uno de sus roles', () => {
    const missing = TOURS.filter((t) => t.id !== 'bienvenida').flatMap((t) =>
      t.roles.filter((r) => !guideFor(r).sections.some((s) => s.tour === t.id)).map((r) => `${t.id} → ${r}`),
    );
    expect(missing).toEqual([]);
  });

  it('las fichas de sección para 360: una por pantalla y rol, con su clave', () => {
    const cards = sectionCards();
    expect(new Set(cards.map((c) => c.key)).size).toBe(cards.length);
    for (const c of cards) {
      expect(c.key).toMatch(/^seccion:\/[^:]+:(boss|dispatch|politics|ivt|camera|social)$/);
      expect(c.roles).toHaveLength(1);
      expect(c.body.length).toBeGreaterThan(20);
    }
  });
});

describe('Mensajes, dicho igual en todas las guías (§7.2)', () => {
  it('«Para todos» dice quién lee, que queda, Enter, sin teléfonos, la agenda y «Quién habla con quién»', () => {
    const body = SHARED.find((t) => t.id === 'mensajes')!.body.join(' ');
    for (const s of [CHAT_NOTICE, MSG_ENTER, MSG_PHONES, MSG_AGENDA, MSG_RELATIVE, MSG_FREE, MSG_RULES]) expect(body).toContain(s);
  });

  for (const role of TEAM_ROLES) {
    it(`${guideFor(role).label}: su sección de Mensajes y la de una conversación`, () => {
      const g = guideFor(role);
      const list = g.sections.find((s) => s.screen === '/mensajes')!;
      expect(list.youDo.join(' ')).toContain(CHAT_NOTICE);
      const conv = g.sections.find((s) => s.screen === '/mensajes/[id]')!;
      const text = [conv.what, ...conv.youDo, ...(conv.cannot ?? [])].join(' ');
      for (const s of [CHAT_NOTICE_LINE, CHAT_COMPOSER_LINE, MSG_ENTER, MSG_PHONES, MSG_RULES]) expect(text).toContain(s);
      // Who knows the agenda is told not to write it; Redes and política, why a message may be hidden.
      const knows = role === 'boss' || role === 'dispatch' || role === 'ivt' || role === 'camera';
      expect(text.includes(MSG_AGENDA)).toBe(knows);
      expect(text.includes(MSG_FREE)).toBe(!knows);
      expect(text).toMatch(/no se borra|ni borrar/);
    });
  }
});

describe('Redes por formato en las guías (R4, D-77, §6)', () => {
  it('Redes: armar el mes, el feed, mandar a aprobación, lo aprobado, el diseño, los avisos y «Ya lo publiqué», con su flujo', () => {
    const g = guideFor('social');
    for (const id of ['pieza', 'enviar', 'editar-aprobada', 'feed', 'mes', 'diseno', 'aviso', 'publicado']) expect(g.tasks.some((t) => t.id === id), id).toBe(true);
    expect(g.tasks.find((t) => t.id === 'feed')!.tour).toBe('feed');
    expect(g.faq.some((f) => f.q === '¿Por qué volvió al jefe?')).toBe(true);
    expect(g.flows).toContain('mes-redes');
    for (const screen of ['/redes', '/redes/[formato]', '/redes/feed', '/redes/buscar', '/piezas/nueva', '/piezas/[id]']) expect(g.sections.some((s) => s.screen === screen), screen).toBe(true);
    expect(g.sections.some((s) => s.screen === '/piezas')).toBe(false);
    // Redes never deletes a piece; the section says so.
    expect(g.sections.find((s) => s.screen === '/redes/[formato]')!.cannot?.join(' ')).toContain('Eliminar una pieza');
  });

  it('el jefe: eliminar una pieza, el resumen del mes y desaprobar un diseño; la sala con los avisos y la vuelta a la tarjeta', () => {
    const g = guideFor('boss');
    for (const id of ['redes', 'eliminar-pieza', 'resumen-mes', 'diseno', 'aprobar-pieza']) expect(g.tasks.some((t) => t.id === id), id).toBe(true);
    expect(g.tasks.find((t) => t.id === 'aprobar-pieza')!.steps.join(' ')).toContain('«Leí los avisos de cumplimiento»');
    expect(g.tasks.find((t) => t.id === 'diseno')!.steps.join(' ')).toContain('«¿Pedir cambios también?»');
    const room = g.sections.find((s) => s.screen === '/aprobar/[id]')!;
    expect(room.youDo.join(' ')).toContain('«Leí los avisos de cumplimiento»');
    expect(g.sections.find((s) => s.screen === '/redes/[formato]')!.youDo.join(' ')).toContain('«Eliminar»');
  });

  it('el flujo «El mes de Redes»: Redes crea por formato, arma el feed, el jefe aprueba, Redes publica, el tablero y el cierre', () => {
    const f = FLOWS.find((x) => x.id === 'mes-redes')!;
    expect(f.title).toBe('El mes de Redes');
    expect(f.steps.map((s) => s.id)).toEqual(['mes', 'crea', 'feed', 'envia', 'aprueba', 'publica', 'tablero', 'cierre']);
    expect(f.steps.find((s) => s.id === 'aprueba')!.roles).toEqual(['boss']);
    for (const s of f.steps) if (s.href) expect(screenFor(s.href), s.href).not.toBeNull();
  });

  it('administración: «Cupo y pilares» y recuperar lo que eliminó el jefe; no elimina piezas', () => {
    const s = ADMIN_GUIDE.sections.find((x) => x.screen === '/ajustes/contenido')!;
    expect(s.title).toBe('Cupo y pilares');
    expect(s.youDo.join(' ')).toContain('«Recuperar»');
    expect(s.cannot?.join(' ')).toContain('Eliminar piezas');
  });
});

describe('la guía de administración va aparte (D-43)', () => {
  it('sus pantallas son de administración y dice que no entra a Mensajes y que el rol de jefe no se da desde Equipo', () => {
    for (const s of ADMIN_GUIDE.sections) if (s.screen) expect(canOpen(s.screen, ['admin']), s.screen).toBe(true);
    const notes = ADMIN_GUIDE.notes.join(' ');
    expect(notes).toContain('Mensajes no es para administración');
    expect(notes).toContain('--jefe');
  });
});
