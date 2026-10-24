// Ajustes → Asistente: the panel's pure logic (tabs, schemas, scripts from real answers) and
// the rules its pages must keep (docs/ASISTENTE.md «El panel», manual §13).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  TABS,
  actionLabel,
  correctionDraft,
  draftTarget,
  fmtMs,
  hasAssistantLine,
  idParam,
  keyStatus,
  knowledgeSchema,
  pageParam,
  pairAnswers,
  parseTab,
  profileSchema,
  rolesText,
  scriptFromAnswer,
  scriptSchema,
  splitList,
  tabHref,
  testSchema,
  toolLabel,
  withNameHole,
} from '@/components/assistant/panel-core';
import { variantsOf } from '@/lib/assistant/local';
import { hasDate } from '@/lib/assistant/redact';
import { panelLink } from '@/lib/assistant/escalate';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const DIR = 'src/app/(panel)/ajustes/asistente';

describe('las ocho pestañas', () => {
  it('son las del contrato, en su orden', () => {
    expect(TABS.map((t) => t.label)).toEqual(['Lo que sabe', 'Cómo contesta', 'Conversaciones', 'Cómo va', 'Lo que preguntan', 'Por confirmar', 'Lo que hizo', 'Ajustes']);
  });

  it('?tab= elige la pestaña; el enlace del aviso al equipo abre la conversación', () => {
    expect(parseTab('va')).toBe('va');
    expect(parseTab(['hizo', 'x'])).toBe('hizo');
    expect(parseTab('cualquier-cosa')).toBe('sabe');
    expect(parseTab(undefined)).toBe('sabe');
    const link = new URL(panelLink(ID), 'http://x');
    expect(link.pathname).toBe('/ajustes/asistente');
    expect(parseTab(link.searchParams.get('tab') ?? undefined, link.searchParams.get('conversacion'))).toBe('conversaciones');
    expect(idParam(link.searchParams.get('conversacion'))).toBe(ID);
    expect(idParam('1; drop table')).toBeNull();
    expect(tabHref('conversaciones', { conversacion: ID, pagina: null })).toBe(`/ajustes/asistente?tab=conversaciones&conversacion=${ID}`);
    expect(pageParam('3')).toBe(3);
    expect(pageParam('-1')).toBe(1);
    expect(pageParam('abc')).toBe(1);
  });
});

describe('lo que se valida antes de llamar al servidor', () => {
  it('fichas: título y texto; roles solo del equipo; los ids de «Lo que preguntan» son ids', () => {
    expect(knowledgeSchema.safeParse({ title: ' ', body: 'x' }).error?.issues[0].message).toBe('Falta el título.');
    expect(knowledgeSchema.safeParse({ title: 'x', body: 'y'.repeat(6001) }).error?.issues[0].message).toMatch(/muy largo/);
    expect(knowledgeSchema.safeParse({ title: 'x', body: 'y', roles: ['writer'] }).error?.issues[0].message).toBe('Algún rol no es del equipo.');
    expect(knowledgeSchema.safeParse({ title: 'x', body: 'y', heardIds: ['nope'] }).success).toBe(false);
    const ok = knowledgeSchema.parse({ title: ' Plazos ', body: 'Rojo: lo aprueba el jefe.', roles: ['social'] });
    expect(ok).toMatchObject({ title: 'Plazos', roles: ['social'], tags: [], heardIds: [] });
  });

  it('guiones: al menos una línea «[ASISTENTE]:» con texto', () => {
    expect(hasAssistantLine('Persona: hola\n[ASISTENTE]: ¡Hola!')).toBe(true);
    expect(hasAssistantLine('Persona: hola\n[ASISTENTE]:   ')).toBe(false);
    expect(scriptSchema.safeParse({ topic: 'x', script: 'sin variantes' }).error?.issues[0].message).toMatch(/\[ASISTENTE\]/);
    expect(scriptSchema.parse({ topic: 'x', script: '[ASISTENTE]: y' })).toMatchObject({ always: false, fromConversation: false, notes: '', triggers: [] });
  });

  it('probador y ajustes', () => {
    expect(testSchema.safeParse({ question: '' }).success).toBe(false);
    expect(testSchema.safeParse({ question: 'x'.repeat(1501) }).success).toBe(false);
    expect(testSchema.parse({ question: 'hola', role: 'social' }).role).toBe('social');
    expect(profileSchema.safeParse({ name: '' }).error?.issues[0].message).toBe('Falta el nombre.');
    expect(profileSchema.safeParse({ name: 'x'.repeat(41) }).success).toBe(false);
    expect(profileSchema.parse({ name: 'Nube' })).toEqual({ name: 'Nube', emoji: '', intro: '' });
  });

  it('listas: separadas por coma o por línea, sin repetidos', () => {
    expect(splitList('como subo, Cómo subo\n  subir   material \n,,')).toEqual(['como subo', 'Cómo subo', 'subir material']);
    expect(splitList('a, A, b')).toEqual(['a', 'b']);
  });
});

describe('guiones desde conversaciones reales', () => {
  it('«Así se contesta»: la pregunta y la respuesta, con el nombre como hueco', () => {
    const d = scriptFromAnswer('¿cómo te\nllamas?', 'Me llamo Nube.\nSoy el asistente de Nubecita.', 'Nube');
    expect(d.topic).toBe('¿cómo te llamas?');
    expect(d.triggers).toEqual(['¿cómo te llamas?']);
    expect(d.script).toBe('Persona: ¿cómo te llamas?\n[ASISTENTE]: Me llamo [ASISTENTE]. Soy el asistente de Nubecita.');
    // The backend reads it as one answer variant.
    expect(variantsOf(d.script)).toEqual(['Me llamo [ASISTENTE]. Soy el asistente de Nubecita.']);
    expect(scriptSchema.safeParse({ ...d }).success).toBe(true);
  });

  it('la pregunta ya viene tachada: [fecha] y [hora] no cuentan como fecha', () => {
    const d = scriptFromAnswer('¿qué pasa el [fecha] a las [hora]?', 'Eso no lo manejo yo.', 'Nube');
    expect(hasDate(d.script)).toBe(false);
  });

  it('«Corregir»: el editor abre con la pregunta puesta y la respuesta por escribir', () => {
    const d = correctionDraft('  ¿Dónde subo   el material? ');
    expect(d.script).toBe('Persona: ¿Dónde subo el material?\n[ASISTENTE]: ');
    expect(hasAssistantLine(d.script)).toBe(false);
    expect(correctionDraft('x'.repeat(200)).topic.length).toBeLessThanOrEqual(80);
  });

  it('cada respuesta con la pregunta que contestó', () => {
    const msgs = [
      { id: '1', who: 'persona' as const, body: 'hola' },
      { id: '2', who: 'asistente' as const, body: '¡Hola!' },
      { id: '3', who: 'persona' as const, body: '¿qué tengo pendiente?' },
      { id: '4', who: 'asistente' as const, body: 'Nada.' },
    ];
    expect(pairAnswers(msgs).map((p) => [p.answer.id, p.question])).toEqual([['2', 'hola'], ['4', '¿qué tengo pendiente?']]);
  });

  it('el nombre solo se cambia cuando es la palabra entera', () => {
    expect(withNameHole('Soy Ana, no Anabel.', 'Ana')).toBe('Soy [ASISTENTE], no Anabel.');
    expect(withNameHole('Soy 360. El Diagnóstico 3600 no.', '360')).toBe('Soy [ASISTENTE]. El Diagnóstico 3600 no.');
    expect(withNameHole('Hola', 'A')).toBe('Hola');
  });
});

describe('cómo se leen las cosas', () => {
  it('lo que hizo, a quién iría un aviso, roles y tiempos', () => {
    expect(actionLabel('marcar_avisos_leidos', { result: { marcados: 3 } })).toBe('Marcó avisos como leídos (3)');
    expect(actionLabel('avisar_al_equipo', { motivo: 'Pidió hablar con alguien.' })).toBe('Avisó al equipo: Pidió hablar con alguien.');
    expect(actionLabel('otra_cosa')).toBe('otra cosa');
    expect(draftTarget({ role: 'todos' })).toBe('Todo el equipo');
    expect(draftTarget({ role: 'social' })).toBe('Redes');
    expect(rolesText(null)).toBe('Todos los roles');
    expect(rolesText(['social', 'camera'])).toBe('Redes, Grabación');
    expect(fmtMs(null)).toBe('—');
    expect(fmtMs(350)).toBe('350 ms');
    expect(fmtMs(2340)).toBe('2,3 s');
  });

  it('las claves: en palabras simples, nunca valores ni nombres de la configuración del servidor', () => {
    const base = { provider: 'groq', keyEnv: 'GROQ_API_KEY', present: true, prefixOk: true, spaces: false, similar: [], known: true };
    expect(keyStatus(base)).toEqual({ tone: 'ok', text: 'La clave de Groq está puesta.' });
    expect(keyStatus({ ...base, present: false, prefixOk: null }).text).toBe('La clave de Groq no está puesta.');
    expect(keyStatus({ ...base, present: false, prefixOk: null, similar: ['GROQ_KEY'] }).text).toBe('La clave de Groq no está puesta. Hay una con un nombre parecido: revisa cómo se escribió.');
    expect(keyStatus({ ...base, present: false, prefixOk: null, similar: ['GROQ_KEY', 'GROQ_TOKEN'] }).text).toContain('Hay 2 con nombres parecidos');
    expect(keyStatus({ ...base, spaces: true })).toEqual({ tone: 'warn', text: 'La clave de Groq tiene espacios al principio o al final.' });
    expect(keyStatus({ ...base, prefixOk: false }).tone).toBe('warn');
    expect(keyStatus({ ...base, provider: 'openai', keyEnv: 'OPENAI_API_KEY' }).text).toBe('La clave de OpenAI está puesta.');
    expect(keyStatus({ ...base, known: false, provider: 'anthropic' }).tone).toBe('danger');
    for (const k of [base, { ...base, present: false, similar: ['GROQ_KEY'] }, { ...base, spaces: true }, { ...base, prefixOk: false }]) {
      expect(keyStatus(k).text).not.toMatch(/[A-Z]+_[A-Z_]+/);
    }
  });

  it('lo que consultó para contestar, con palabras y no con el nombre interno', () => {
    expect(toolLabel('buscar_evento')).toBe('Buscó un evento');
    expect(toolLabel('mis_pendientes')).toBe('Buscó los pendientes');
    expect(toolLabel('avisar_al_equipo')).toBe('Avisó al equipo');
    expect(toolLabel('algo_nuevo')).toBe('Algo nuevo');
    expect(toolLabel(undefined)).toBe('Otra consulta');
    // Every tool the assistant has gets its own words.
    const tools = [...fs.readFileSync('src/lib/assistant/tools.ts', 'utf8').matchAll(/^\s+name: '([a-z_]+)',$/gm)].map((m) => m[1]);
    expect(tools.length).toBeGreaterThan(5);
    for (const t of tools) expect(toolLabel(t), t).not.toContain('_');
    for (const t of tools) expect(toolLabel(t), t).not.toBe(t.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()));
  });
});

describe('reglas de las páginas del panel', () => {
  const files = fs.readdirSync(DIR).map((f) => path.join(DIR, f));
  const src = (f: string) => fs.readFileSync(path.join(DIR, f), 'utf8');

  it('solo administración: la página pide requireRole(\'admin\')', () => {
    expect(src('page.tsx')).toMatch(/requireRole\('admin'\)/);
  });

  it('cada pestaña tiene su sección y los botones del contrato', () => {
    const all = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    for (const label of ['Actualizar lo que sabe', 'Probador', 'Así se contesta', 'Corregir', 'Probar la cadena', 'Enseñarle el dato', 'Enseñarle cómo contestar', 'Confirmar y mandar', 'Deshacer']) {
      expect(all, label).toContain(label);
    }
    for (const t of ['KnowledgeTab', 'ScriptsTab', 'ConversationsTab', 'HealthTab', 'HeardTab', 'DraftsTab', 'ActionsTab', 'ProfileTab']) expect(src('page.tsx')).toContain(`<${t} `);
  });

  it('las lecturas del asistente nunca van dentro de db(session, …) (la base demo se bloquea)', () => {
    for (const f of files) expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/db\(s,/);
    expect(fs.readFileSync('src/lib/actions/assistant.ts', 'utf8')).not.toMatch(/import[^;]*\b(withUser|act|withSystem)\b[^;]*;/);
  });

  it('el archivo de acciones solo exporta funciones async (\'use server\')', () => {
    const a = fs.readFileSync('src/lib/actions/assistant.ts', 'utf8');
    expect(a.startsWith("'use server';")).toBe(true);
    const exported = [...a.matchAll(/^export\s+(\S+)\s+(\S+)/gm)].map((m) => `${m[1]} ${m[2]}`);
    expect(exported.length).toBeGreaterThan(10);
    for (const e of exported) expect(e).toMatch(/^async function/);
  });

  it('sin términos de programador: ni nombres de la configuración, ni «tokens», ni nombres de herramientas', () => {
    const sections = src('sections.tsx');
    expect(sections).not.toContain('ASISTENTE_MODELOS');
    expect(sections).not.toMatch(/tokens['`]|"Tokens"|tokens`/);
    expect(sections).not.toMatch(/^\s*\{t\.tool\}\s*$/m);
    expect(sections).toContain('{toolLabel(t.tool)}');
    expect(sections).not.toContain('Degradada');
  });

  it('el día se escribe con mayúscula solo al principio («Sábado 24 de oct»)', () => {
    expect(src('sections.tsx')).not.toMatch(/\bcapitalize\b/);
  });

  it('en el teléfono, la pestaña abierta se trae a la vista', () => {
    expect(src('page.tsx')).toMatch(/<TabStrip current=\{tab\}/);
    expect(src('tab-strip.tsx')).toContain('[aria-current="page"]');
  });

  it('la tarjeta «Asistente» está en Ajustes', () => {
    expect(fs.readFileSync('src/app/(panel)/ajustes/page.tsx', 'utf8')).toContain("href: '/ajustes/asistente'");
  });
});
