// The guides as Markdown for the repo (R3, D-42, design §7.5): docs/GUIA-POR-ROL.md, docs/FLUJOS.md (Mermaid, which
// GitHub draws) and docs/GUIA-ADMINISTRACION.md. Pure: the same source as the app, so the documents never drift
// (tests/unit/guides-docs.test.ts compares them; scripts/guides-docs.mts writes them). Never edit the .md by hand.
import { TEAM_ROLES, type TeamRole } from '../roles';
import type { AdminGuide, Flow, FlowStep, RoleGuide, SharedTopic, Tour } from './types';

// The line on top of every document. Real people are named only in the docs (tests/unit/roles.test.ts), so the name
// is put together here and lands only in docs/*.md.
const ASKED_BY = ['Hil', 'lary'].join('');
export const NOT_SENT = `> **No se manda todavía: ${ASKED_BY} pidió probar cada rol antes (25/10).**`;
const GENERATED = (file: string) =>
  `<!-- Generado por \`npm run docs:guides\` desde src/lib/guides/ (${file}). No se edita a mano: se cambia la fuente y se corre otra vez. -->`;

const SHORT: Record<TeamRole, string> = { boss: 'Jefe', dispatch: 'Despacho', politics: 'Política', ivt: 'IVT', camera: 'Grabación', social: 'Redes' };

/** «Jefe o Despacho» (who does a step) or, with 'y', «Jefe, Despacho y Redes» (who a flow involves). */
export function who(roles: readonly TeamRole[], and: 'o' | 'y' = 'o'): string {
  const n = roles.map((r) => SHORT[r]);
  return n.length <= 1 ? (n[0] ?? '') : `${n.slice(0, -1).join(', ')} ${and} ${n[n.length - 1]}`;
}

// The demo accounts of docs/DEMO.md (invented, *.test addresses): how to try each role.
const DEMO_USERS: [string, string][] = [
  ['Jefe', '`jefe@demo.test`'],
  ['Despacho', '`despacho@demo.test`'],
  ['Política', '`politica@demo.test`'],
  ['IVT', '`ivt@demo.test`'],
  ['Grabación', '`grabacion@demo.test` y `grabacion2@demo.test`'],
  ['Redes', '`redes@demo.test` y `redes2@demo.test`'],
];

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const bullets = (items: readonly string[]) => items.map((x) => `- ${x}`).join('\n');
const numbered = (items: readonly string[]) => items.map((x, i) => `${i + 1}. ${x}`).join('\n');
export const flowAnchor = (id: string) => `flujo-${id}`;

function sharedMd(topics: readonly SharedTopic[]): string {
  return ['## Para todos', ...topics.map((t) => `### ${t.title}\n${bullets(t.body)}`)].join('\n\n');
}

function roleMd(g: RoleGuide, flows: readonly Flow[], tours: readonly Tour[]): string {
  const a = g.account;
  const tourTitle = (id?: string) => tours.find((t) => t.id === id)?.title;
  const flowTitle = (id?: string) => flows.find((f) => f.id === id)?.title;
  const out: string[] = [];
  out.push(`## ${g.label}`);
  out.push(
    [
      `**Inicio:** \`${a.home}\` · **Menú:** ${a.menu.join(', ')} · **En el teléfono:** ${a.phoneBar.join(', ')}` +
        (a.more.length ? ` (en «Más»: ${a.more.join(', ')})` : ''),
      `**Crear:** ${a.create.length ? a.create.join(', ') : 'no tiene el botón'} · **Doble factor:** ${a.twoFactor ? 'sí' : 'no'} · En la app: \`/ayuda/${g.slug}\``,
    ].join('  \n'),
  );
  out.push(`### Tu trabajo\n${g.job.mission}`);
  out.push(`**Lo que haces**\n\n${bullets(g.job.responsibilities)}`);
  out.push(`**Nunca**\n\n${bullets(g.job.never)}`);
  out.push(`**Con quién trabajas**\n\n${bullets(g.job.worksWith.map((w) => `**${SHORT[w.role]}.** ${w.what}`))}`);
  out.push(`**Tu ritmo**\n\n${bullets(g.job.rhythm)}`);
  out.push(`### Tu día\n${numbered(g.day)}`);
  out.push(
    [
      '### Paso a paso',
      ...g.tasks.map((t) => {
        const extra = [flowTitle(t.flow) ? `Flujo: [${flowTitle(t.flow)}](FLUJOS.md#${flowAnchor(t.flow!)})` : '', tourTitle(t.tour) ? `Tutorial en la app: “${tourTitle(t.tour)}”` : '']
          .filter(Boolean)
          .join(' · ');
        return `#### ${t.title}\n_Cuándo:_ ${t.when}\n\n${numbered(t.steps)}${extra ? `\n\n${extra}` : ''}`;
      }),
    ].join('\n\n'),
  );
  const rows = g.sections.map((s) => {
    const does = [...s.youDo, ...(s.cannot ?? []).map((c) => `No puedes: ${c}`)].map(cell).join('<br>');
    return `| **${cell(s.title)}**<br>${cell(s.menu)} · \`${s.screen}\` | ${cell(s.what)} | ${does} |`;
  });
  out.push(['### Cada sección de la app', '| Sección | Para qué | Qué haces |', '|---|---|---|', ...rows].join('\n'));
  out.push(`### Flujos\n${bullets(g.flows.map((id) => `[${flowTitle(id)}](FLUJOS.md#${flowAnchor(id)})`))}`);
  out.push(`### Preguntas\n${g.faq.map((f) => `**${f.q}**\n${f.a}`).join('\n\n')}`);
  return out.join('\n\n');
}

/** docs/GUIA-POR-ROL.md: «Para todos», then each role, then how to try it in the demo. */
export function renderGuideMd(p: { shared: readonly SharedTopic[]; guides: readonly RoleGuide[]; flows: readonly Flow[]; tours: readonly Tour[] }): string {
  const parts = [
    '# Guía por rol',
    NOT_SENT,
    GENERATED('shared.ts, boss.ts, dispatch.ts, politics.ts, ivt.ts, camera.ts, social.ts'),
    'Son seis roles: el jefe, el despacho, política, el IVT, Grabación y Redes. Para cada uno: su trabajo, su día, cada ' +
      'tarea paso a paso y lo que se hace en cada sección de la app, con los botones como los dice la pantalla («…»). Lo ' +
      'mismo está en la app, en «Mi cuenta» → «Ayuda y guías», con los tutoriales de cada pantalla. Los flujos entre ' +
      'roles están en [FLUJOS.md](FLUJOS.md). La guía de administración va aparte, en ' +
      '[GUIA-ADMINISTRACION.md](GUIA-ADMINISTRACION.md).',
    sharedMd(p.shared),
    ...p.guides.map((g) => roleMd(g, p.flows, p.tours)),
    [
      '## Cómo probar en la demo',
      'En la versión de demostración tocas el rol en «Versión de demostración» y entras directo (`DEMO.md`). Todo es ' +
        'inventado. Lo que uno crea puede no verse con otro rol o en otro teléfono (`DECISIONES.md` D-39 y D-57).',
      '',
      '| Rol | Cuenta de la demo |',
      '|---|---|',
      ...DEMO_USERS.map(([r, e]) => `| ${r} | ${e} |`),
      '',
      'Qué probar primero con cada rol: el tutorial de su inicio («Mi cuenta» → «Ver el tutorial: Bienvenida»), su ' +
        'guía en «Ayuda y guías», una conversación en Mensajes y lo de su «Paso a paso».',
    ].join('\n'),
  ];
  return parts.join('\n\n') + '\n';
}

// ── Mermaid ───────────────────────────────────────────────────────────────────────────────────────────────────────

// Inside a quoted Mermaid label: no double quotes, no # (it starts an entity), no line breaks.
const label = (s: string) => s.replace(/"/g, '“').replace(/#/g, 'n.º ').replace(/\s+/g, ' ').trim();
// An edge's text, unquoted: letters, spaces and commas only.
const edge = (s: string) => s.replace(/[^\p{L}\p{N} ,]/gu, '').trim();
const node = (flow: Flow, id: string) => `${flow.id}_${id}`.replace(/[^A-Za-z0-9_]/g, '_');

/** One flow as a Mermaid flowchart (top to bottom): an action per step, a diamond per question, a box per answer. */
export function flowMermaid(flow: Flow): string {
  const lines = ['flowchart TD'];
  const next = (i: number) => flow.steps[i + 1];
  flow.steps.forEach((s: FlowStep, i) => {
    const id = node(flow, s.id);
    lines.push(`  ${id}["${label(`${who(s.roles)}: ${s.text}`)}"]`);
    if (s.question) {
      const q = `${id}_q`;
      lines.push(`  ${id} --> ${q}{"${label(s.question)}"}`);
      (s.branches ?? []).forEach((b, j) => {
        const bid = `${id}_b${j + 1}`;
        lines.push(`  ${q} -- ${edge(b.label)} --> ${bid}["${label(b.text)}"]`);
        if (b.to) lines.push(`  ${bid} --> ${node(flow, b.to)}`);
      });
    } else if (next(i)) {
      lines.push(`  ${id} --> ${node(flow, next(i)!.id)}`);
    }
  });
  return lines.join('\n');
}

function flowList(flow: Flow): string {
  const n = (id: string) => flow.steps.findIndex((s) => s.id === id) + 1;
  return flow.steps
    .map((s, i) => {
      const head = `${i + 1}. **${who(s.roles)}:** ${s.text}${s.href ? ` (\`${s.href}\`)` : ''}`;
      if (!s.question) return head;
      const branches = (s.branches ?? []).map((b) => `   - ${b.label} → ${b.text}${b.to && n(b.to) !== i + 2 ? ` Sigue en el paso ${n(b.to)}.` : ''}`);
      return [head, `   ${s.question}`, ...branches].join('\n');
    })
    .join('\n');
}

/** docs/FLUJOS.md: each flow in Mermaid and as a list. */
export function renderFlowsMd(flows: readonly Flow[]): string {
  const parts = [
    '# Flujos: cómo va el trabajo entre todos',
    NOT_SENT,
    GENERATED('flows.ts'),
    'Cómo pasa el trabajo de un rol a otro. GitHub dibuja cada diagrama; debajo va el mismo flujo en lista. En la app ' +
      'está en «Mi cuenta» → «Ayuda y guías» → «Cómo va el trabajo entre todos», con «tú» en los pasos de cada quien. ' +
      'Ningún flujo lleva fechas ni horas.',
    bullets(flows.map((f) => `[${f.title}](#${flowAnchor(f.id)})`)),
    ...flows.map((f) =>
      [`<a id="${flowAnchor(f.id)}"></a>`, '', `## ${f.title}`, `Lo hacen: ${who(f.roles, 'y')}.`, '', '```mermaid', flowMermaid(f), '```', '', flowList(f)].join('\n'),
    ),
  ];
  return parts.join('\n\n') + '\n';
}

/** docs/GUIA-ADMINISTRACION.md: Administración's guide, apart from the team's (D-43). */
export function renderAdminMd(g: AdminGuide): string {
  const parts = [
    '# Guía de administración',
    NOT_SENT,
    GENERATED('admin.ts'),
    g.mission + ' En la app: `/ayuda/administracion` (solo administración).',
    `## Lo que no es de administración\n${bullets(g.notes)}`,
    ['## Cada pantalla', ...g.sections.map((s) => `### ${s.title}${s.screen ? ` (\`${s.screen}\`)` : ''}\n${s.what}\n\n${bullets([...s.youDo, ...(s.cannot ?? []).map((c) => `No puedes: ${c}`)])}`)].join('\n\n'),
    `## Preguntas\n${g.faq.map((f) => `**${f.q}**\n${f.a}`).join('\n\n')}`,
  ];
  return parts.join('\n\n') + '\n';
}

/** The three documents, by their path under the app's folder. */
export function renderAllDocs(p: { shared: readonly SharedTopic[]; guides: readonly RoleGuide[]; flows: readonly Flow[]; tours: readonly Tour[]; admin: AdminGuide }): Record<string, string> {
  if (p.guides.map((g) => g.role).join() !== TEAM_ROLES.join()) throw new Error('Las guías van en el orden del equipo.');
  return {
    'docs/GUIA-POR-ROL.md': renderGuideMd(p),
    'docs/FLUJOS.md': renderFlowsMd(p.flows),
    'docs/GUIA-ADMINISTRACION.md': renderAdminMd(p.admin),
  };
}
