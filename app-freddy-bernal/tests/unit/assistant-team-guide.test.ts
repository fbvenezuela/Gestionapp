// 360 knows the team guide and finds the right piece of it (WF-C2, 18/11; Juan: «asegúrate que el bot sepa todo, TODO lo
// que está en las guías y cómo poder explicarlo»). Two mechanisms of the answer index (src/lib/assistant/answers/engine.ts):
// (a) a word of «Palabras de la app» asked by what it describes («¿cómo se llama…?», «¿qué nombre tiene…?», «¿a qué se
//     refieren con…?») or by one of its properties («¿cuántas piezas lleva el feed?», «¿cuánto dura una historia?»): that
//     word, with what its meaning says, above weaker matches; never a count of the word itself, a «nunca», or «¿qué es lo
//     que tengo que hacer con…?»;
// (b) the role's own job and its «Nunca» answer a question about them asked whole («¿qué tengo que hacer yo en la app?»,
//     «¿qué es lo que nunca debo hacer?»), and never stand in for a question about something else.
// The index only (pure): no database.
import { describe, it, expect } from 'vitest';
import type { Role } from '@/lib/roles';
import { bestAnswer, describedTerm, findAnswers, readable, selfAsk } from '@/lib/assistant/answers/engine';

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
      ['camera', '¿cuántos espacios tiene el feed de cada mes?', 'palabra:feed'],
      ['ivt', '¿cuánto tiempo dura una historia en el perfil?', 'palabra:historia-y-sticker'],
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
    expect(selfAsk('¿qué tengo que hacer yo en la app?')).toBe('job');
    expect(selfAsk('y cuál es mi función como política')).toBe('job');
    expect(selfAsk('¿de qué me encargo?')).toBe('job');
    expect(selfAsk('¿qué hago yo?')).toBe('job');
    expect(selfAsk('¿qué cosas no me tocan?')).toBe('never');
    expect(selfAsk('¿qué es lo que nunca debo hacer como jefe?')).toBe('never');
    expect(selfAsk('¿qué tengo prohibido hacer?')).toBe('never');
    // Otra pregunta: la pantalla en la que está, lo pendiente de hoy, un problema, una cosa que se nombra.
    expect(selfAsk('¿qué hago aquí?', '/agenda/por-fecha')).toBeNull();
    expect(selfAsk('¿qué hago?')).toBeNull();
    expect(selfAsk('¿qué me toca hoy?')).toBeNull();
    expect(selfAsk('no puedo subir el video')).toBeNull();
    expect(selfAsk('¿qué no puedo hacer con una pieza aprobada?')).toBeNull();
    expect(selfAsk('¿qué tengo que hacer para publicar?')).toBeNull();
  });

  it('el trabajo y el «Nunca» del rol van primero y seguros, para cada rol del equipo', () => {
    const slug: Record<string, string> = { boss: 'jefe', dispatch: 'despacho', politics: 'politica', ivt: 'ivt', camera: 'grabacion', social: 'redes' };
    for (const role of TEAM) {
      const job = bestAnswer('¿qué es lo que tengo que hacer yo en esta app?', { roles: [role] });
      expect(job?.entry.id, role).toBe(`${slug[role]}:trabajo`);
      expect(job?.confidence).toBe('strong');
      const never = bestAnswer('¿qué cosas nunca debo hacer?', { roles: [role] });
      expect(never?.entry.id, role).toBe(`${slug[role]}:nunca`);
      expect(never?.text).toMatch(/^No te toca: /);
    }
    // Administración no tiene «Nunca» en su guía: nada se inventa.
    expect(findAnswers('¿qué cosas nunca debo hacer?', { roles: ['admin'] }).some((m) => m.entry.kind === 'never')).toBe(false);
  });

  it('nunca de relleno: lo que se pregunta de otra cosa no recibe el trabajo, 360 ni la app', () => {
    for (const [role, q] of [
      ['social', '¿cómo se llama lo que va escrito dentro de la imagen de un post?'],
      ['camera', '¿qué hago con el storyboard antes de grabar?'],
      ['ivt', '¿qué es lo que tengo que hacer con las fotos del antes?'],
    ] as [Role, string][]) {
      const m = bestAnswer(q, { roles: [role] });
      expect(m?.entry.id, `${role}: ${q}`).not.toMatch(/^curado:todo-360-quien$|^curado:todo-que-es-app$|:trabajo$/);
    }
  });
});
