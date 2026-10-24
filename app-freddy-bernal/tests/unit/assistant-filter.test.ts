// Output filter (§10), server nets (§11) and redact(): pure functions.
import { describe, it, expect } from 'vitest';
import { filterOutput, looksLikeText, promisesNotice, breaksAgendaRule, asksAboutPublishing, pickFichas, type Ficha } from '@/lib/assistant/brain';
import { redact, hasDateOrTime, hasDate } from '@/lib/assistant/redact';
import { fillHuecos } from '@/lib/assistant/text';

describe('filtro de salida', () => {
  it('quita markdown: negritas, cursivas, código, títulos y viñetas', () => {
    expect(filterOutput('## Listo\n**Quedan 6 días** de _tweets_ y `mañana` revisa.')).toBe('Listo\nQuedan 6 días de tweets y mañana revisa.');
    expect(filterOutput('- Primero esto\n- Luego aquello')).toBe('Primero esto\nLuego aquello');
    expect(filterOutput('Mira [la agenda](/agenda) cuando puedas.')).toBe('Mira la agenda cuando puedas.');
  });

  it('quita los bytes de control que se escapan de algunos modelos', () => {
    expect(filterOutput('Hola\u0000 equipo\u0007, ya� está.')).toBe('Hola equipo, ya está.');
  });

  it('las frases que delatan al modelo se quitan ENTERAS, partiendo por frases', () => {
    expect(filterOutput('Claro. Como IA no tengo opiniones. La pieza está aprobada.')).toBe('Claro. La pieza está aprobada.');
    expect(filterOutput('Soy un modelo de lenguaje entrenado por alguien! Pero te ayudo: quedan 4 días.')).toBe('Pero te ayudo: quedan 4 días.');
    // Not cut "until the next dot" in the middle: no ellipsis left behind.
    expect(filterOutput('Te cuento… como inteligencia artificial diría que sí. Revisa Hoy.')).not.toMatch(/\.\.\.|…\s*$/);
  });

  it('nunca deja la respuesta vacía: si el filtro se lo come todo, gana el original', () => {
    expect(filterOutput('Soy un modelo de lenguaje.')).toBe('Soy un modelo de lenguaje.');
    expect(filterOutput('**[estado]**')).toBe('[estado]'); // markdown goes; the sentence stays (never empty)
    expect(filterOutput('\u0000No tengo acceso a esa confirmación.')).toBe('No tengo acceso a esa confirmación.');
  });

  it('los huecos sin rellenar y el prefijo de guion copiado no salen', () => {
    expect(filterOutput('[ASISTENTE]: La pieza «[titulo]» está [estado]. ¿Algo más?')).toBe('¿Algo más?');
    expect(filterOutput('360: Hola, ¿en qué te ayudo?', '360')).toBe('Hola, ¿en qué te ayudo?');
  });

  it('looksLikeText: más de 8 caracteres, la mitad letras y sin ristras de puntos', () => {
    expect(looksLikeText('Quedan 6 días de tweets.')).toBe(true);
    expect(looksLikeText('ok')).toBe(false);
    expect(looksLikeText('..........')).toBe(false);
    expect(looksLikeText('Bueno.... ya')).toBe(false);
    expect(looksLikeText('1234 5678 9012 !!')).toBe(false);
    expect(looksLikeText('')).toBe(false);
    // Short and correct is text (the manual: more than 8 characters, half letters).
    expect(looksLikeText('¡De nada!')).toBe(true);
    expect(looksLikeText('Sí, claro.')).toBe(true);
    expect(looksLikeText('Sí, en Hoy.')).toBe(true);
    expect(looksLikeText('De nada.')).toBe(false); // 8 characters: not «more than 8»
    expect(looksLikeText('a1 2 3 4 5 6')).toBe(false);
  });
});

describe('redes del servidor', () => {
  it('reconoce cuando DICE que avisó (no cuando lo ofrece)', () => {
    expect(promisesNotice('Listo, ya avisé al equipo.')).toBe(true);
    expect(promisesNotice('Le pasé tu mensaje a administración.')).toBe(true);
    expect(promisesNotice('Tranquila, te van a escribir pronto.')).toBe(true);
    expect(promisesNotice('Alguien del equipo te escribe hoy.')).toBe(true);
    expect(promisesNotice('¿Quieres que le avise a administración?')).toBe(false);
    expect(promisesNotice('Marqué tus avisos como leídos.')).toBe(false);
    expect(promisesNotice('Los avisos llegan a la campana.')).toBe(false);
  });

  it('una respuesta sobre eventos con fecha u hora rompe la regla de la agenda', () => {
    expect(breaksAgendaRule('El evento es a las 10:30 en la escuela.', '¿a qué hora es el evento?')).toBe(true);
    expect(breaksAgendaRule('La jornada es el lunes 3 de noviembre.', '¿cuándo es la jornada de salud?')).toBe(true);
    expect(breaksAgendaRule('El evento va en material listo.', '¿cómo va el evento del puente?')).toBe(false);
    // Best hours are not the agenda.
    expect(breaksAgendaRule('En TikTok rinde más 22:00–23:59.', '¿a qué hora publico en TikTok?')).toBe(false);
    // …even when the question names the event («publico» + network = publishing).
    const hours = [{ tool: 'mejores_horas', ok: true }];
    expect(breaksAgendaRule('En Instagram, de 6:00 p. m. a 9:00 p. m.', '¿A qué hora publico el video de la entrega de viviendas en Instagram?', hours)).toBe(false);
    expect(breaksAgendaRule('De 7:00 a 9:00.', '¿A qué hora publico en TikTok el video del evento de la cancha?')).toBe(false);
    expect(breaksAgendaRule('De 7:00 a 9:00.', '¿Cuándo publico el video del acto en TikTok?', hours)).toBe(false);
    // A date is never a best hour, and an event lookup keeps the strict rule.
    expect(breaksAgendaRule('Publícalo el 3 de nov.', '¿Cuándo publico el video del acto en TikTok?', hours)).toBe(true);
    expect(breaksAgendaRule('Es a las 7:00.', '¿A qué hora publico lo del acto en TikTok?', [{ tool: 'buscar_evento', ok: true }])).toBe(true);
    // Real schedule questions are still caught, also with the new ways of writing times.
    expect(breaksAgendaRule('El recorrido es el 3 de nov a las cuatro de la tarde.', '¿cuándo es el recorrido del puente?')).toBe(true);
    expect(breaksAgendaRule('A las cinco y media.', '¿a qué hora sale el jefe al acto?')).toBe(true);
  });

  it('qué cuenta como pregunta de publicar', () => {
    expect(asksAboutPublishing('¿A qué hora publico en TikTok el video del evento de la cancha?')).toBe(true);
    expect(asksAboutPublishing('¿A qué hora sale el video del acto en Instagram?')).toBe(true);
    expect(asksAboutPublishing('¿A qué hora sale el jefe al acto?')).toBe(false); // no network: the agenda
    expect(asksAboutPublishing('¿Cuál es la mejor hora para llegar al acto?')).toBe(false);
    expect(asksAboutPublishing('¿A qué hora es el recorrido del puente?')).toBe(false);
  });
});

describe('redact: lo que escribe la persona, antes del proveedor y de guardarse', () => {
  it('correos y teléfonos', () => {
    expect(redact('Escríbeme a ana.perez@correo.test o al 0414-1234567')).toBe('Escríbeme a [correo] o al [numero]');
    expect(redact('Llama al +58 414 123 45 67, por favor')).toBe('Llama al [numero], por favor');
  });

  it('horas: 10:30, 3 p. m., 3pm, «a las 9»', () => {
    expect(redact('el acto es a las 10:30')).toBe('el acto es a las [hora]');
    expect(redact('llego tipo 3 p. m. al sitio')).toBe('llego tipo [hora] al sitio');
    expect(redact('a las 9 en punto')).toBe('a las [hora] en punto');
    expect(redact('sale 3pm')).toBe('sale [hora]');
    expect(redact('las 4 de la tarde')).toBe('las [hora]');
  });

  it('fechas: 24/10, 24-10-2026, «lunes 3 de noviembre», 2026-10-24', () => {
    expect(redact('¿qué pasa el 24/10?')).toBe('¿qué pasa el [fecha]?');
    expect(redact('quedó para el 24-10-2026')).toBe('quedó para el [fecha]');
    expect(redact('es el lunes 3 de noviembre en la plaza')).toBe('es el [fecha] en la plaza');
    expect(redact('el 3 de noviembre de 2026')).toBe('el [fecha]');
    expect(redact('iso 2026-10-24')).toBe('iso [fecha]');
  });

  it('no estropea lo que no es dato personal ni de agenda', () => {
    expect(redact('¿Cuántos días de tweets quedan? Son 1.200 personas y 600 m².')).toBe('¿Cuántos días de tweets quedan? Son 1.200 personas y 600 m².');
    expect(redact('¿el video va en 9:16?')).toBe('¿el video va en 9:16?');
    expect(redact('a las 9:16')).toBe('a las [hora]');
  });

  it('fechas y horas escritas de otras formas (lo que el manual promete cubrir)', () => {
    expect(redact('El recorrido del puente es el 3 de nov a las cuatro de la tarde. ¿Qué falta?')).toBe('El recorrido del puente es el [fecha] a las [hora]. ¿Qué falta?');
    expect(redact('es el 3 de nov')).toBe('es el [fecha]');
    expect(redact('es el 3 nov')).toBe('es el [fecha]');
    expect(redact('quedó para dic 24')).toBe('quedó para [fecha]');
    expect(redact('el 5 de sept. de 2026')).toBe('el [fecha]');
    expect(redact('es a las cuatro de la tarde')).toBe('es a las [hora]');
    expect(redact('a las cinco y media')).toBe('a las [hora]');
    expect(redact('sobre las 7 llegamos')).toBe('sobre las [hora] llegamos');
    expect(redact('a la una')).toBe('a la [hora]');
    expect(redact('llego tipo cinco')).toBe('llego tipo [hora]');
    expect(redact('de las dos a las cuatro')).toBe('de las [hora] a las [hora]');
    expect(redact('a las 7 y 30')).toBe('a las [hora]');
    expect(redact('es al mediodía')).toBe('es [hora]');
    // Abbreviations never eat other words.
    expect(redact('la marca dice que mayor es mejor')).toBe('la marca dice que mayor es mejor');
    expect(redact('¿cuál de las dos fórmulas uso?')).toBe('¿cuál de las dos fórmulas uso?');
    expect(redact('para 3 redes')).toBe('para 3 redes');
  });

  it('un teléfono por grupos sale ENTERO (la regla de fechas no se come el final)', () => {
    expect(redact('el contacto en sitio es 0414-555-12-34')).toBe('el contacto en sitio es [numero]');
    expect(redact('contacto: 0414.555.12.34')).toBe('contacto: [numero]');
    expect(redact('contacto: 0414-555-12-34')).not.toContain('0414');
  });

  it('números que no son fechas: tamaños, proporciones, versiones, pasos', () => {
    for (const t of ['YouTube acepta hasta 2.5 GB', 'formato 4/5', 'abierto 24/7', 'en 1.91:1', 'versión 1.2', 'paso 1-2', 'tarda 1-2 días', 'el día 15/13']) {
      expect(hasDate(t), t).toBe(false);
      expect(redact(t), t).toBe(t);
    }
    expect(redact('¿un video de 2.5 GB pasa en Instagram?')).toBe('¿un video de 2.5 GB pasa en Instagram?');
    // A real day/month still counts.
    expect(hasDate('el 24/7')).toBe(true);
    expect(hasDate('quedó para el 3/11')).toBe(true);
  });

  it('detectores separados de fecha/hora', () => {
    expect(hasDateOrTime('a las 10:30')).toBe(true);
    expect(hasDateOrTime('quedan 6 días')).toBe(false);
    expect(hasDate('plazo de 60 minutos a las 10:30')).toBe(false);
    expect(hasDate('el 24/10')).toBe(true);
  });
});

describe('qué fichas entran en el turno', () => {
  const f = (key: string, title: string, body: string, tags: string[] = []): Ficha => ({ key, title, body, tags });
  const all = [
    f('guia:rol-redes', 'Qué hace Redes', 'Storyboard, piezas, copies.'),
    f('guia:rol-grabacion', 'Qué hace Grabación', 'Sube el material.'),
    f('guia:agenda-privada', 'La agenda es privada', 'Nunca la da.'),
    f('guia:subir-material', 'Cómo se sube el material crudo', 'Abrir el evento, pestaña Material.', ['material', 'subir']),
    f('auto:formula:FAB', 'Fórmula FAB', 'Características, ventajas, beneficios.', ['copies']),
  ];
  it('la del rol y la de la agenda siempre; del resto, las que se parecen a la pregunta', () => {
    const keys = pickFichas(all, '¿Cómo subo el material?', ['camera']).map((x) => x.key);
    expect(keys).toEqual(['guia:rol-grabacion', 'guia:agenda-privada', 'guia:subir-material']);
  });
});

describe('huecos fijos', () => {
  it('rellena nombre, plataforma, jefe y persona, con «del» y «al» bien escritos', () => {
    const h = { name: 'Brisa', app: 'la plataforma', boss: 'el jefe', person: 'Ana' };
    expect(fillHuecos('Soy [ASISTENTE], de [APP]. Hola, [NOMBRE]: la agenda de [JEFE] se la pides a [JEFE].', h)).toBe(
      'Soy Brisa, de la plataforma. Hola, Ana: la agenda del jefe se la pides al jefe.',
    );
    expect(fillHuecos('la cancha de El Mirador', h)).toBe('la cancha de El Mirador');
  });
});
