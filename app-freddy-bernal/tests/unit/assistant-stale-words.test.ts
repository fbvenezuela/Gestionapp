// 360 speaks with the words of the team guide (the PDF of the 11/11 round): no curated answer, guide card, script,
// persona line or fixed line of the demo brain says again what the guide stopped saying. «Los globitos», not «el
// sobre»; «etiquetas», not «chips»; the box of the level, not «Cambiar nivel»; the marks of each network, not «No
// pasa»; the reading mode's + and −, its green button and its X; «queda aceptado desde que se guarda»; «se queda el
// último cambio guardado»; «te llega un aviso»; «si entraste con el doble factor»; «la app», never «la plataforma» nor
// anything internal (the database, the server, the install command). The ways of asking (`q:`, the matchers of the
// brain) keep how people talk («el sobre», «la plataforma»): they are not read here. A «label» the screen shows is
// read apart: the word rules skip it («Nació de una ficha del IVT» is the screen's text).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { quotedLabels } from '@/lib/guides/check';
import { ANSWER_FILES, type Answer } from '@/lib/assistant/answers';
import knowledge from '../../config/assistant/knowledge.json';
import scripts from '../../config/assistant/scripts.json';
import persona from '../../config/assistant/persona.json';
import roles from '../../config/assistant/roles.json';

type Said = { where: string; text: string };

// Old wordings of the screen's labels: matched on the whole text, labels included.
const LABEL_RULES: [name: string, re: RegExp][] = [
  ['«Cambiar nivel» (es la cajita del nivel)', /«Cambiar nivel»/],
  ['«No pasa» (es la marca roja de cada red)', /«No pasa»|«Todo bien», «Revisar»/],
  // («Seguir» stays: the screen's own message says «Se cortó la subida. Toca «Seguir» para continuar.»)
  ['los botones del modo lectura y de la subida son iconos', /«(?:Letra más grande|Letra más pequeña|Desplazar solo|Salir del modo lectura|Velocidad|Pausar|Quitar de la lista)»/],
  ['las flechas ‹ y › de la agenda', /flechas «Anterior»|«Anterior» y «Siguiente» para moverte/],
  ['la X del tutorial no dice «Salir del tutorial»', /«Salir del tutorial»/],
  ['la X de la franja no dice «Ahora no»', /«Ahora no»/],
  ['Mi cuenta va sin «» (es el muñequito)', /«Mi cuenta»/],
  ['la entrega de Grabación va sin «»', /«Entrega de Grabación»/],
  ['el nivel de aprobación va sin «» (es su cajita)', /«Nivel de aprobación»/],
  ['el enlace para ver todo o ver más', /«Ver todo en «Por aprobar»»|«Ver más en «Hoy»»/],
  ['«Publicar antes (#20)» lleva su número', /«Publicar (?:antes|después)»/],
  ['«Nada pendiente en esta categoría: ¡al día!» completo', /«¡al día!»/],
  ['el teléfono de Mi perfil se va (decisión 6)', /Teléfono \(opcional\)/],
  ['las etiquetas contadas llevan un número de ejemplo, nunca «(n)»', /\((?:n|N)\)»|«(?:n|N) (?:tweets|personas|de 24)|«Mes n\b|#nn?»|«n\/m»|Programar en n redes|Aprobar los n»|Quedan n días|x de y»/],
  ['lo que la pantalla dice va entre «», no entre “ ”', /“(?:ya tiene fecha|Ya tiene fecha|Mensaje nuevo|¿Te muestro esta pantalla\?|Enviando…)”/],
  ['«Volver a la agenda» lo pone otra vez en la agenda', /«Volver a la agenda» lo trae|lo traen? con «Volver a la agenda»/],
  ['«Mover» cambia solo el día o la hora', /«Mover»:? \(?otra fecha/],
  ['«Cambiar fecha o lugar» abre todo junto', /«Cambiar fecha o lugar» para la dirección|[Pp]ara la dirección, «Cambiar fecha o lugar»/],
];

// Old wordings of 360's own words: matched on the text without its «labels».
const WORD_RULES: [name: string, re: RegExp][] = [
  ['los globitos, no el sobre', /\b(?:el|del|al) sobre\b(?! (?:el|la|los|las|lo|un|una|qué|cómo|quién|cuál|eso|esto|esa|ese|tu|su|mi|cada|todo|todos|todas|tus|sus|mis|algo|nada|cuándo|dónde|si)\b)|\bsobre de arriba\b/i],
  ['etiquetas, no chips', /\bchips?\b/i],
  ['queda aceptado o sale de una ficha, no «nace»', /\bn(?:ace|acen|ació|acieron)\b/i],
  ['se queda el último cambio guardado', /\bgana (?:lo|el|la) últim[oa]\b/i],
  ['te llega un aviso, no «te avisamos»', /\bavisamos\b/i],
  ['si entraste con el doble factor', /\b(?:se )?ven? con el doble factor\b|\bves con el doble factor\b|\bcon el doble factor (?:ves|se ven?)\b/i],
  ['administración la puede recuperar', /\b(?:no|nada) se borran? de verdad\b/i],
  ['la app nunca te manda esos datos', /\blo cuida\b/i],
  ['nada interno', /\bbase de datos\b|\bservidor(?:es)?\b|\bsupabase\b|\bfase\b|npm run|db:first-admin|\bpor ahora\b/i],
  ['la app, no la plataforma', /\bplataforma\b/i],
  ['nunca se publica sola', /\b(?:nunca|no) sale sol[ao]s?\b/i],
  ['la subida sigue sola, sin «por partes»', /\bpor partes\b/i],
  ['según en qué van, no «etapa»', /\betapas?\b/i],
  ['cada persona ve solo lo que su rol le deja ver', /\bcon sus permisos\b|\bpega(?:s|la)? (?:su|la) dirección\b|\bcopia la dirección\b/i],
  ['tres textos: largo, medio y corto', /\btres largos\b/i],
  ['quedan pocos días con tweets programados', /\bpocos días de tweets\b/i],
  ['el mes que estás viendo', /\bmes (?:que tienes )?abierto\b/i],
  ['el cupo es una meta', /\binformativo\b/i],
  ['puede hacer todo lo que hace Redes', /\btienes? todo(?:,)? (?:hasta )?lo de Redes\b/i],
  ['en la historia solo se añaden cosas', /\bsolo se agrega\b/i],
  ['lo que sale queda fijo', /\b(?:se ve|queda) en lectura\b/i],
  ['administración puede leer lo que le preguntas a 360', /administración ve lo que (?:le |me )?preguntas/i],
  ['un motivo ya escrito', /\bmotivos? rápidos?\b/i],
  ['ya no te la ofrece en ese teléfono', /\bdeja de ofrecer/i],
  ['lo escrito en las tarjetas', /\bcampos de (?:la|las) tarjetas?\b/i],
  ['sin esperas ni tomas que no sirven', /\b(?:tomas|tiempos) muertos?\b|\btomas muertas\b/i],
  ['los teléfonos de otras personas', /\bde terceros\b/i],
  ['el estado cambia solo', /\bse calculan solos\b/i],
  ['como lo pones tú, queda aceptado', /\blo tuyo queda aceptado\b/i],
  ['la guía solo se ve con señal', /no guarda páginas/i],
  ['una aplicación de códigos', /\bapp autenticadora\b|\bel autenticador\b/i],
];

const plain = (text: string) => quotedLabels(text).reduce((t, l) => t.replace(`«${l}»`, ' '), text);
const textsOf = (a: Answer): [string, string][] => (typeof a.a === 'string' ? [['', a.a]] : Object.entries(a.a).filter((e): e is [string, string] => typeof e[1] === 'string'));

// Every string value of a JSON config, by path, but its «$comment» (a note for whoever edits the file).
function strings(v: unknown, where: string, out: Said[]): Said[] {
  if (typeof v === 'string') out.push({ where, text: v });
  else if (Array.isArray(v)) v.forEach((x, i) => strings(x, `${where}[${i}]`, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== '$comment') strings(x, `${where}.${k}`, out);
  return out;
}

// What the demo brain and the tools say in their own code: the text of its string literals. Not the ways of asking:
// regular expressions, String.raw sources and the word lists of the matchers (tokens(…), words(…), new Set(…)).
function codeStrings(file: string): Said[] {
  const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const out: Said[] = [];
  const skipCall = (n: ts.Node) => {
    const p = n.parent;
    if (ts.isTaggedTemplateExpression(p)) return true;
    if ((ts.isCallExpression(p) || ts.isNewExpression(p)) && p.arguments?.includes(n as ts.Expression)) {
      const name = p.expression.getText(src);
      return /^(?:tokens|words|RegExp|Set|new Set)$|\.(?:test|match|replace|split|includes|startsWith)$/.test(name);
    }
    return false;
  };
  const visit = (n: ts.Node) => {
    let text: string | null = null;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) text = skipCall(n) ? null : n.text;
    else if (ts.isTemplateExpression(n)) text = skipCall(n) ? null : [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(' … ');
    if (text !== null && /\p{L}{2,} \p{L}{2,}/u.test(text)) {
      const line = src.getLineAndCharacterOfPosition(n.getStart(src)).line + 1;
      out.push({ where: `${file}:${line}`, text });
    }
    if (!ts.isTemplateExpression(n)) ts.forEachChild(n, visit);
  };
  visit(src);
  return out;
}

const SAID: Said[] = [
  ...Object.entries(ANSWER_FILES).flatMap(([file, list]) => list.flatMap((a) => textsOf(a).map(([k, text]) => ({ where: `answers/${file}/${a.id}${k ? `/${k}` : ''}`, text })))),
  ...strings(knowledge, 'knowledge', []),
  ...strings(scripts, 'scripts', []),
  ...strings(persona, 'persona', []),
  ...strings(roles, 'roles', []),
  ...codeStrings('src/lib/assistant/local.ts'),
  ...codeStrings('src/lib/assistant/tools.ts'),
];

describe('360 dice lo que dice la guía del equipo', () => {
  it('lee todo lo que dice: respuestas, fichas, guiones, persona, roles y las líneas fijas del asistente', () => {
    expect(SAID.filter((s) => s.where.startsWith('answers/')).length).toBeGreaterThan(1500);
    expect(SAID.filter((s) => s.where.startsWith('knowledge')).length).toBeGreaterThan(100);
    expect(SAID.filter((s) => s.where.startsWith('src/lib/assistant/local.ts')).length).toBeGreaterThan(30);
    // The matchers stay out: no regular expression source is read as something 360 says.
    expect(SAID.some((s) => s.where.startsWith('src/lib/assistant/local.ts') && /\(\?:/.test(s.text))).toBe(false);
  });

  it('ninguna etiqueta vieja de la pantalla', () => {
    const bad = SAID.flatMap((s) => LABEL_RULES.filter(([, re]) => re.test(s.text)).map(([name]) => `${s.where}: ${name} :: ${s.text.slice(0, 160)}`));
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('ninguna palabra vieja en lo que 360 dice con sus palabras', () => {
    const bad = SAID.flatMap((s) => {
      const text = plain(s.text);
      return WORD_RULES.filter(([, re]) => re.test(text)).map(([name]) => `${s.where}: ${name} :: ${s.text.slice(0, 160)}`);
    });
    expect(bad, `\n${bad.join('\n')}`).toEqual([]);
  });

  it('la ficha de Mensajes empieza en los globitos y administración no tiene los globitos', () => {
    const card = (knowledge as { knowledge: { key: string; body: string }[] }).knowledge.find((c) => c.key === 'mensajes');
    expect(card?.body).toMatch(/^Mensajes está en los globitos de arriba/);
    // NO_MSG (answers/todos.ts), the same sentence as the guides' NO_MESSAGES_LINE: what administración hears.
    const noMsg = SAID.filter((s) => /\/admin$/.test(s.where) && s.text === 'Mensajes es del equipo: administración no lo ve, y por eso no tiene los globitos.');
    expect(noMsg.length).toBeGreaterThan(5);
  });

  it('las reglas atrapan lo que dicen atrapar (y dejan pasar las etiquetas de la pantalla)', () => {
    const hit = (t: string) => LABEL_RULES.some(([, re]) => re.test(t)) || WORD_RULES.some(([, re]) => re.test(plain(t)));
    for (const old of [
      'Mensajes está en el sobre de arriba.',
      'Los chips de arriba cuentan por etapa.',
      'Toca «Cambiar nivel».',
      'Nace aceptado y el despacho se entera.',
      'Gana lo último guardado y te avisamos.',
      'Los contactos se ven con el doble factor.',
      'No se borra de verdad.',
      'La base de datos lo cuida.',
      'Pega la dirección de la plataforma.',
      'Toca «Aprobar todas las verdes (n)».',
      'En «Mis datos», tu «Teléfono (opcional)».',
      '«Letra más grande» y «Desplazar solo».',
    ])
      expect(hit(old), old).toBe(true);
    for (const ok of [
      'Al lado dice de dónde viene: «Nació de una ficha del IVT».',
      'Si dice «Los contactos se ven con el doble factor.», entra otra vez.',
      'Habla sobre el evento, no sobre la fecha.',
      'Solo tú, con el doble factor, desde los tres puntos de su tarjeta.',
      '«Marcar realizado» sale solo cuando el evento ya empezó.',
      'Toca «Aprobar todas las verdes (2)».',
    ])
      expect(hit(ok), ok).toBe(false);
  });
});
