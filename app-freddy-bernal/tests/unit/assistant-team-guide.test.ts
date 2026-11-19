// 360 knows the team guide and finds the right piece of it (WF-C2, 18/11; Juan: «asegúrate que el bot sepa todo, TODO lo
// que está en las guías y cómo poder explicarlo»). Two mechanisms of the answer index (src/lib/assistant/answers/engine.ts):
// (a) a word of «Palabras de la app» asked by what it describes («¿cómo se llama…?», «¿qué nombre tiene…?», «¿a qué se
//     refieren con…?») or by one of its properties («¿cuántas piezas lleva el feed?», «¿cuánto dura una historia?»): that
//     word, with what its meaning says, above weaker matches; never a count of the word itself, a «nunca», or «¿qué es lo
//     que tengo que hacer con…?»;
// (b) the role's own job and its «Nunca» answer a question about them asked whole («¿qué tengo que hacer yo en la app?»,
//     «¿qué es lo que nunca debo hacer?»), and never stand in for a question about something else;
// (c), (e) the curated answers say what the guide says, each role its own version («¿la app publica sola?»: Redes and the
//     boss hear how it is done; the others, that Redes publishes by hand);
// (f) a word typed with one slip («tutorail») is read as the word it was meant to be; on a screen, the screen's own
//     entries count more, the more of the question they say (a «¿por qué…?», only a little); who a role works with, asked
//     with the team's names; a step of a flow that the whole team does is said without the six names; readable() reads
//     each text once and the same every time.
// The index only (pure): no database. Every question here was written for this file (none is a bank's).
import { describe, it, expect } from 'vitest';
import type { Role } from '@/lib/roles';
import { FLOWS } from '@/lib/guides/flows';
import { bestAnswer, describedTerm, entryById, findAnswers, oneSlip, readable, selfAsk, textFor } from '@/lib/assistant/answers/engine';

const TEAM: Role[] = ['boss', 'dispatch', 'politics', 'ivt', 'camera', 'social'];

describe('(a) una palabra preguntada por lo que describe o por una propiedad', () => {
  it('«¿cómo se llama…?» y «¿qué nombre tiene…?» buscan la palabra por su significado', () => {
    expect(readable('¿cómo se le dice a eso?')).toContain('comosellama');
    expect(readable('¿qué nombre tiene esa lista?')).toContain('comosellama');
    // «¿Cómo te llamas?» es otra pregunta: el nombre de 360, no el de una palabra.
    expect(readable('¿cómo te llamas?')).not.toContain('comosellama');
    for (const [role, q, id] of [
      ['social', '¿cómo se llama la primera frase que engancha al que ve la pieza?', 'palabra:hook-y-cta'],
      ['boss', 'la cuadrícula del perfil, ¿qué nombre le da la app?', 'palabra:feed'],
      ['camera', 'el nivel verde, amarillo o rojo de una pieza, ¿cómo se le dice?', 'palabra:semaforo'],
      ['dispatch', 'la nota que deja Grabación para quien edita, ¿cómo se le dice?', 'palabra:nota-para-el-editor'],
    ] as [Role, string, string][]) {
      expect(describedTerm(q, [role])?.entry.id, `${role}: ${q}`).toBe(id);
      const m = bestAnswer(q, { roles: [role] });
      expect(m?.entry.id, `${role}: ${q}`).toBe(id);
      expect(m?.confidence).toBe('strong');
    }
  });

  it('una propiedad que su significado dice: cuántos, cuánto dura, qué lleva', () => {
    for (const [role, q, id] of [
      ['camera', '¿y el feed de un mes cuántos espacios trae?', 'palabra:feed'],
      ['ivt', 'una historia de instagram, ¿por cuánto tiempo se ve?', 'palabra:historia-y-sticker'],
    ] as [Role, string, string][])
      expect(describedTerm(q, [role])?.entry.id, `${role}: ${q}`).toBe(id);
  });

  it('nunca: la palabra sola contada, un «nunca», «¿qué es lo que tengo que hacer con…?» o una palabra de otro dominio', () => {
    for (const q of [
      '¿cuántos reels?',
      '¿cuántas salas?',
      '¿cuántas piezas de Redes?',
      '¿qué es lo que nunca se publica sin aprobar?',
      '¿qué es lo que tengo que hacer con el feed?',
      '¿qué son las que tienen el plazo vencido?',
    ])
      for (const role of ['social', 'boss'] as Role[]) expect(describedTerm(q, [role]), `${role}: ${q}`).toBeNull();
  });
});

describe('(b) el trabajo del rol y lo que nunca le toca, solo cuando se preguntan', () => {
  it('selfAsk reconoce la pregunta entera, con «yo», «en la app» o «como jefe» alrededor', () => {
    expect(selfAsk('¿qué me toca hacer a mí en la app?')).toBe('job');
    expect(selfAsk('y cuál es mi función como política')).toBe('job');
    expect(selfAsk('¿de qué me encargo?')).toBe('job');
    expect(selfAsk('¿qué hago yo?')).toBe('job');
    expect(selfAsk('¿qué cosas no me tocan?')).toBe('never');
    expect(selfAsk('como jefe, ¿qué cosas no debo hacer?')).toBe('never');
    expect(selfAsk('¿qué tengo prohibido hacer?')).toBe('never');
    // Otra pregunta: la pantalla en la que está, lo pendiente de hoy, un problema, una cosa que se nombra.
    expect(selfAsk('¿y en esta pantalla qué hago?', '/agenda/por-fecha')).toBeNull();
    expect(selfAsk('¿qué hago?')).toBeNull();
    expect(selfAsk('¿qué me toca hoy?')).toBeNull();
    expect(selfAsk('no puedo subir el video')).toBeNull();
    expect(selfAsk('¿qué no puedo hacer con una pieza aprobada?')).toBeNull();
    expect(selfAsk('¿qué tengo que hacer para publicar?')).toBeNull();
  });

  it('el trabajo y el «Nunca» del rol van primero y seguros, para cada rol del equipo', () => {
    const slug: Record<string, string> = { boss: 'jefe', dispatch: 'despacho', politics: 'politica', ivt: 'ivt', camera: 'grabacion', social: 'redes' };
    for (const role of TEAM) {
      const job = bestAnswer('¿y yo en esta app de qué me encargo?', { roles: [role] });
      expect(job?.entry.id, role).toBe(`${slug[role]}:trabajo`);
      expect(job?.confidence).toBe('strong');
      const never = bestAnswer('¿qué cosas no me toca hacer?', { roles: [role] });
      expect(never?.entry.id, role).toBe(`${slug[role]}:nunca`);
      expect(never?.text).toMatch(/^No te toca: /);
    }
    // Administración no tiene «Nunca» en su guía: nada se inventa.
    expect(findAnswers('¿qué cosas no me toca hacer?', { roles: ['admin'] }).some((m) => m.entry.kind === 'never')).toBe(false);
  });

  it('nunca de relleno: lo que se pregunta de otra cosa no recibe el trabajo, 360 ni la app', () => {
    for (const [role, q] of [
      ['social', 'lo que sale escrito sobre el video de una historia, ¿cómo se le dice?'],
      ['camera', '¿qué hago con el storyboard antes de grabar?'],
      ['ivt', '¿qué es lo que tengo que hacer con las fotos del antes?'],
    ] as [Role, string][]) {
      const m = bestAnswer(q, { roles: [role] });
      expect(m?.entry.id, `${role}: ${q}`).not.toMatch(/^curado:todo-360-quien$|^curado:todo-que-es-app$|:trabajo$/);
    }
  });
});

describe('(f) una palabra con una letra mal, la pantalla en la que estás y con quién trabajas', () => {
  it('oneSlip: una letra de más, de menos o dos letras al revés, en palabras largas que empiezan igual', () => {
    expect(oneSlip('tutorail', 'tutorial')).toBe(true); // dos al revés
    expect(oneSlip('publicacon', 'publicacion')).toBe(true); // una de menos
    expect(oneSlip('notificacionn', 'notificacion')).toBe(true); // una de más
    expect(oneSlip('materal', 'material')).toBe(true);
    // Nunca: una letra cambiada (otra palabra de verdad), palabras cortas, que empiezan distinto, a dos letras, o la misma.
    expect(oneSlip('capital', 'capitul')).toBe(false);
    expect(oneSlip('mensajr', 'mensaje')).toBe(false);
    expect(oneSlip('pieza', 'pizza')).toBe(false);
    expect(oneSlip('nombre', 'hombre')).toBe(false);
    expect(oneSlip('contacto', 'contrato')).toBe(false);
    expect(oneSlip('tutorial', 'tutorial')).toBe(false);
  });

  it('la palabra mal escrita se lee como la que es: la misma respuesta que bien escrita', () => {
    for (const [role, typo, fine] of [
      ['politics', '¿cómo cierro un tutorail?', '¿cómo cierro un tutorial?'],
      ['camera', 'como subo el materal del evento', 'como subo el material del evento'],
      ['social', 'donde estan los mensjaes nuevos', 'donde estan los mensajes nuevos'],
    ] as [Role, string, string][]) {
      const a = bestAnswer(typo, { roles: [role] });
      const b = bestAnswer(fine, { roles: [role] });
      expect(a?.entry.id, `${role}: ${typo}`).toBe(b?.entry.id);
      expect(a?.confidence, `${role}: ${typo}`).toBe('strong');
    }
  });

  it('una pregunta de fuera de la app no se vuelve otra por una palabra parecida', () => {
    // «capital» no es «capítulos» (la descripción de un video de YouTube).
    for (const role of ['social', 'boss'] as Role[]) {
      const m = bestAnswer('¿cuál es la capital de Portugal?', { roles: [role] });
      expect(m?.confidence === 'strong' ? m.text : '', role).not.toMatch(/cap[ií]tulos/);
    }
  });

  it('el nombre de un evento o de una persona nunca se corrige', () => {
    // «Montalbán» no es «montaban»: un nombre dicho se deja como nombre.
    const m = findAnswers('¿qué pasó con lo de Montalbanes?', { roles: ['boss'], names: ['Montalbanes'] });
    for (const x of m) expect(x.via.toLowerCase()).not.toContain('montaban');
  });

  it('en una pantalla, la entrada de esa pantalla gana un empate de una sola palabra', () => {
    const m = bestAnswer('¿y lo de mis datos?', { roles: ['boss'], screen: '/perfil' });
    expect(m?.entry.screen).toBe('/perfil');
    expect(m?.confidence).toBe('strong');
    expect(m?.text).toMatch(/«Mis datos»/);
  });

  it('con quién trabaja cada rol, también dicho con los nombres del equipo', () => {
    for (const [role, q, id] of [
      ['boss', 'el despacho qué hace por mí', 'jefe:con:dispatch'],
      ['camera', '¿qué le paso a Redes?', 'grabacion:con:social'],
      ['ivt', '¿qué hace el jefe por mí?', 'ivt:con:boss'],
    ] as [Role, string, string][]) {
      const all = findAnswers(q, { roles: [role], limit: 3 }).map((x) => x.entry.id);
      expect(all, `${role}: ${q}`).toContain(id);
    }
  });
});

describe('(a) otras formas de preguntar qué es una palabra', () => {
  it('«¿a qué se refiere…?» y «¿de qué hablan cuando dicen…?» se leen como «¿qué significa…?»', () => {
    expect(readable('¿a qué se refiere eso del cupo?')).toBe('que significa eso del cupo');
    expect(readable('¿de qué hablan cuando dicen cupo?')).toBe('que significa cupo');
    // Su nombre, por lo que describe, también para Redes.
    expect(describedTerm('el texto que va debajo de la foto cuando se publica, ¿qué nombre tiene?', ['social'])?.entry.id).toBe('palabra:caption');
  });

  it('el nombre preguntado decide: lo que describe puede decir «cuántas», «uno» o «lo que dice» sin volverse otra pregunta', () => {
    for (const [role, q, id] of [
      ['camera', 'eso que dice cuántas piezas lleva cada formato en el mes, ¿cómo le dicen?', 'palabra:mes-cupo-y-pilar'],
      ['ivt', 'en una tarjeta, cada espacio donde uno escribe, ¿cómo se llama?', 'palabra:campos'],
      ['boss', 'lo que uno pone para que la gente comente al final, ¿qué nombre tiene?', 'palabra:hook-y-cta'],
    ] as [Role, string, string][]) {
      expect(describedTerm(q, [role])?.entry.id, `${role}: ${q}`).toBe(id);
      expect(bestAnswer(q, { roles: [role] })?.entry.id, `${role}: ${q}`).toBe(id);
    }
    // …y una cuenta sigue siendo una cuenta: «¿cuántos reels?» no pregunta qué es un reel.
    expect(describedTerm('¿cuántos reels?', ['social'])).toBeNull();
  });
});

describe('(b) 360, la app y el trabajo sí responden cuando se preguntan', () => {
  it('«¿quién eres?» es 360 y «¿esta app pa qué es?» es la app, seguros', () => {
    for (const [role, q, id] of [
      ['social', 'oye y tú quién eres', 'curado:todo-360-quien'],
      ['camera', '¿tú eres una persona de verdad?', 'curado:todo-360-quien'],
      ['politics', 'quién me está contestando', 'curado:todo-360-quien'],
      ['dispatch', 'esta app pa qué es', 'curado:todo-que-es-app'],
      ['ivt', '¿qué es esta plataforma?', 'curado:todo-que-es-app'],
    ] as [Role, string, string][]) {
      const m = bestAnswer(q, { roles: [role] });
      expect(m?.entry.id, `${role}: ${q}`).toBe(id);
      expect(m?.confidence, `${role}: ${q}`).toBe('strong');
    }
  });
});

describe('(c) y (e) lo que dice la guía, para el rol que pregunta', () => {
  it('quién publica: Redes y el jefe oyen cómo se hace; los demás, que lo publica Redes a mano', () => {
    const q = '¿las piezas salen solas en las redes cuando llega la hora?';
    for (const role of TEAM) {
      const m = bestAnswer(q, { roles: [role] });
      expect(m?.text, role).toMatch(/^La app no publica sola/);
      expect(m?.text, role).toMatch(role === 'social' || role === 'boss' ? /en Publicar eliges la pieza/ : /lo publica Redes/);
    }
  });

  it('los hechos de la guía que faltaban, preguntados con otras palabras', () => {
    for (const [role, q, said] of [
      ['boss', 'se me venció el plazo de una pieza, ¿se publica igual?', /nunca se publica sola[\s\S]*«Trancado»/],
      ['social', 'en un canal, ¿qué mensaje sale primero, el viejo o el nuevo?', /del más viejo al más nuevo/],
      ['camera', 'qué es la raya de mensajes nuevos en un canal', /primer mensaje sin leer/],
      ['dispatch', 'una ficha de obra con fecha, ¿cómo sale en la agenda?', /«Visita de obra»/],
      ['boss', 'qué estados tiene una ficha de la comunidad', /«Pendiente» o «Suspendido»/],
      ['social', '¿el buscador de redes también busca en los avisos?', /avisos/],
    ] as [Role, string, RegExp][]) {
      const m = bestAnswer(q, { roles: [role] });
      expect(m?.text, `${role}: ${q}`).toMatch(said);
      expect(m?.confidence, `${role}: ${q}`).toBe('strong');
    }
  });
});

describe('(f) la pantalla, los pasos de los flujos y la lectura de cada texto', () => {
  // How much each entry of the screen rises when the question is asked there.
  const lifts = (role: Role, screen: string, q: string) => {
    const off = new Map(findAnswers(q, { roles: [role], limit: 40 }).map((m) => [m.entry.id, m.score]));
    return findAnswers(q, { roles: [role], screen, limit: 40 })
      .filter((m) => (m.entry.screen === screen || !!m.entry.also?.includes(screen)) && off.has(m.entry.id))
      .map((m) => m.score - off.get(m.entry.id)!);
  };

  it('en una pantalla, un «¿cómo…?» sube más lo que dice la pregunta; un «¿por qué…?», solo un poco', () => {
    for (const [role, screen, how, why] of [
      ['dispatch', '/obras', '¿cómo filtro las que ya tienen fecha?', '¿por qué hay fichas que ya tienen fecha?'],
      ['boss', '/agenda', '¿cómo veo solo lo de esta semana?', '¿por qué no veo lo de esta semana?'],
    ] as [Role, string, string, string][]) {
      expect(Math.max(...lifts(role, screen, how)), `${role}: ${how}`).toBeGreaterThan(0.1);
      const w = lifts(role, screen, why);
      expect(w.length, `${role}: ${why}`).toBeGreaterThan(0);
      for (const l of w) expect(l, `${role}: ${why}`).toBeLessThanOrEqual(0.04 + 1e-9);
      expect(w.some((l) => Math.abs(l - 0.04) < 1e-9), `${role}: ${why}`).toBe(true);
    }
  });

  it('un paso que hace todo el equipo se dice sin los seis nombres; uno de algunos roles, con quién lo hace', () => {
    const who = ['el jefe', 'el despacho', 'política', 'el ivt', 'grabación', 'redes'];
    let whole = 0;
    let some = 0;
    for (const f of FLOWS)
      for (const s of f.steps) {
        const e = entryById(`flujo:${f.id}:${s.id}`);
        expect(e, `${f.id}:${s.id}`).toBeDefined();
        const t = textFor(e!.a, ['boss']);
        if (new Set(s.roles).size === who.length) {
          whole++;
          expect(t, `${f.id}:${s.id}`).not.toMatch(/Grabación o Redes:/);
          expect(t.slice(0, 12).toLowerCase(), `${f.id}:${s.id}`).toBe(s.text.slice(0, 12).toLowerCase());
        } else {
          some++;
          const named = t.slice(0, t.indexOf(': ')).toLowerCase().split(/, | o /);
          expect(named.length && named.every((n) => who.includes(n)), `${f.id}:${s.id}: ${t}`).toBe(true);
        }
      }
    expect(whole).toBeGreaterThan(0);
    expect(some).toBeGreaterThan(0);
    // …y el flujo contado entero tampoco nombra a los seis en una línea.
    for (const f of FLOWS) expect(textFor(entryById(`flujo:${f.id}`)!.a, ['social']), f.id).not.toMatch(/Grabación o Redes:/);
  });

  it('readable() lee cada texto igual cada vez, y el botón verde del modo lectura se sigue leyendo', () => {
    const texts = ['¿cómo se le dice a lo que se paró?', 'en el modo lectura, ¿y el botón verde?', 'el botón verde del modo lectura', 'el botón verde de aprobar', '¿a qué se refiere eso del cupo?'];
    const first = texts.map((t) => readable(t));
    expect(texts.map((t) => readable(t))).toEqual(first);
    expect(first[1]).toBe('en el modo lectura y el boton verde correr texto solo');
    expect(first[2]).toBe('el boton verde correr texto solo del modo lectura');
    // Otro botón verde no es el del modo lectura.
    expect(first[3]).toBe('el boton verde de aprobar');
  });
});
