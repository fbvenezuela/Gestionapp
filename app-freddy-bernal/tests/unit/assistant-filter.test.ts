// Output filter (§10), server nets (§11) and redact(): pure functions.
import { describe, it, expect } from 'vitest';
import { filterOutput, looksLikeText, promisesNotice, breaksAgendaRule, asksAboutPublishing, aboutEvents, asksPlace, asksRoute, asksSchedule, asksWhenWhere, toolMessage, pickFichas, withoutWhenWhere, type Ficha } from '@/lib/assistant/brain';
import { redact, redactDeep, redactQuoted, hasDateOrTime, hasDate } from '@/lib/assistant/redact';
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

  it('preguntas de cuándo, dónde o cómo llegar a un evento, aunque no digan «evento»', () => {
    for (const q of [
      '¿a qué hora es la feria de emprendedores?',
      '¿dónde queda la feria de emprendedores?',
      '¿cómo llego al urbanismo Nuevo Amanecer?',
      '¿con quién hablo en la entrega de viviendas?',
      '¿a qué hora graba Kevin?',
      '¿dónde es el encuentro con los productores?',
      '¿cuándo es la asamblea?',
      '¿qué eventos hay mañana?',
    ]) {
      expect(aboutEvents(q) && asksWhenWhere(q), q).toBe(true);
    }
    // A step or a screen, not a place; a verb, not an event.
    expect(asksWhenWhere('¿Dónde subo el material de la feria?')).toBe(false);
    expect(asksWhenWhere('¿Dónde encuentro las mejores horas?')).toBe(false);
    expect(aboutEvents('¿Dónde encuentro las mejores horas?')).toBe(false);
    expect(aboutEvents('¿Qué hace Grabación?')).toBe(false);
    expect(aboutEvents('¿Cómo grabo en vertical?')).toBe(false);
    expect(aboutEvents('¿El sistema está operativo?')).toBe(false);
    // How-tos: «hay que grabar», «grabo en vertical», «se cambia», «se guarda».
    expect(aboutEvents('¿Cuándo hay que grabar con dron?')).toBe(false);
    expect(aboutEvents('¿Cuándo grabo en vertical y cuándo en horizontal?')).toBe(false);
    expect(asksWhenWhere('¿Dónde es que se cambia la contraseña?')).toBe(false);
    expect(asksWhenWhere('¿Dónde se guarda la grabación?')).toBe(false);
    expect(aboutEvents('¿Dónde se encuentra la feria?') && asksWhenWhere('¿Dónde se encuentra la feria?')).toBe(true);
    expect(asksWhenWhere('¿Cuándo abre la feria?')).toBe(true);
    // «[direccion]» is what redact() left of a place name, not a question about an address.
    expect(asksWhenWhere('¿cómo va el evento del [direccion]?')).toBe(false);
    expect(asksWhenWhere('¿cuál es la dirección del [direccion]?')).toBe(true);
  });

  it('dónde queda o cómo se llega, dicho de otras formas', () => {
    for (const q of ['¿en qué parte queda la cancha techada?', '¿en qué parte es la feria?', '¿la feria queda lejos?']) {
      expect(asksPlace(q) && asksSchedule(q), q).toBe(true);
    }
    // The way there is the agenda only next to an event (the demo brain checks that).
    for (const q of ['¿cómo hago para llegar a la feria?', '¿cómo se va a la feria?', '¿cómo se va al urbanismo?', '¿para llegar a la feria qué agarro?', "¿Cómo se va pa' la feria?", '¿Cómo se va pal acto de la cancha?', '¿Cómo se va hasta la feria?']) {
      expect(asksRoute(q), q).toBe(true);
      expect(asksSchedule(q), q).toBe(false);
    }
    // «Se va a + verb» is the future, not a way there («para llegar a más gente» is one, but names no event).
    for (const q of ['¿Cuándo se va a publicar la pieza?', '¿Qué pasa si se va la señal?', '¿Cuánto tarda en llegar el aviso?']) {
      expect(asksRoute(q), q).toBe(false);
    }
    expect(aboutEvents('¿Cómo hacemos para llegar a más gente?')).toBe(false);
    expect(asksSchedule('¿En qué parte del proceso va la feria?')).toBe(false);
    // «Por dónde se entra a…» goes whole (what is left names the event); alone or to the platform, it is how to log in.
    expect(withoutWhenWhere('¿por dónde se entra a lo de la cancha?')).toBe('a lo de la cancha');
    expect(withoutWhenWhere('¿Por dónde se entra?')).toBe('se entra');
    expect(withoutWhenWhere('¿Por dónde se entra a la plataforma?')).toBe('se entra a la plataforma');
    expect(withoutWhenWhere('¿cómo hago para llegar a la feria?')).toBe('como hago a la feria');
  });

  it('preguntado como agenda (cuándo, dónde, a quién llamo, qué hay un día) y no solo un día nombrado', () => {
    for (const q of ['¿a qué hora sale Kevin?', '¿qué hay el domingo?', '¿hay algo el sábado?', '¿lo de los emprendedores es en la mañana o en la tarde?', 'pásame la dirección de lo de la plaza central', '¿a quién llamo para lo de los productores?']) {
      expect(asksSchedule(q), q).toBe(true);
    }
    for (const q of ['¿Qué hago hoy?', '¿Qué me toca grabar el viernes?', '¿Cómo instalo la app en el teléfono?', '¿Puedo subir fotos en lugar de video?', '¿Dónde cambio la dirección de correo?']) {
      expect(asksSchedule(q), q).toBe(false);
    }
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
    // With a dot, an «h» or a weekday and a numeric date (typed into an event title, for example).
    expect(redact('Visita escuela Zamorano a las 9.30')).toBe('Visita escuela Zamorano a las [hora]');
    expect(redact('desde las 9.30 hasta las 11.00')).toBe('desde las [hora] hasta las [hora]');
    expect(redact('empieza 9.00 am')).toBe('empieza [hora]');
    expect(redact('el 3/11 a las 10.30 p. m.')).toBe('el [fecha] a las [hora]');
    expect(redact('a las 10.11')).toBe('a las [hora]');
    expect(redact('Acto cancha Zamorano el sábado 8h')).toBe('Acto cancha Zamorano el sábado [hora]');
    expect(redact('llegamos 7 hs')).toBe('llegamos [hora]');
    expect(redact('Jornada Zamorano lunes 3/11 7:00')).toBe('Jornada Zamorano [fecha] [hora]');
    // The minutes go with the hour before h / hs / hrs, and a comma counts like the dot.
    expect(redact('Visita Zamorano 19.30 hrs')).toBe('Visita Zamorano [hora]');
    expect(redact('Toma Zamorano 9.30 hs')).toBe('Toma Zamorano [hora]');
    expect(redact('Acto Zamorano 7.30h')).toBe('Acto Zamorano [hora]');
    expect(redact('Acto Zamorano 7.10 hrs')).toBe('Acto Zamorano [hora]');
    expect(redact('Caravana a las 9,30')).toBe('Caravana a las [hora]');
    expect(redact('de 8h a 12h')).toBe('de [hora] a [hora]');
    for (const t of ['a las 9.30', '9.00 am', 'sábado 8h', 'lunes 3/11 7:00', '19.30 hrs', '9.30 hs', '7.30h']) expect(hasDateOrTime(t), t).toBe(true);
    // How long is not when: «tienen 24 h para subir», «en 2 h», «cada 2 h».
    for (const t of ['tienen 24 h para subir el material', 'suban el material en 2 h', 'cada 2 h', 'Son 1,200 personas']) expect(redact(t), t).toBe(t);
    // A dot alone is not a time: versions, ratios, sizes, thousands.
    for (const t of ['versión 1.20', 'en 1.91:1', 'Son 1.200 personas', 'video en 4K a 60fps']) expect(redact(t), t).toBe(t);
    // Abbreviations never eat other words.
    expect(redact('la marca dice que mayor es mejor')).toBe('la marca dice que mayor es mejor');
    expect(redact('¿cuál de las dos fórmulas uso?')).toBe('¿cuál de las dos fórmulas uso?');
    expect(redact('para 3 redes')).toBe('para 3 redes');
  });

  it('direcciones: calle, carrera, avenida, sector, urbanización, km, casa N°… → [direccion]', () => {
    expect(redact('el acto de viviendas es el martes 27 a las 4:00 pm en la calle 3, llamar al 0414-1234567')).toBe(
      'el acto de viviendas es el [fecha] a las [hora] en la [direccion], llamar al [numero]',
    );
    expect(redact('Calle 3 con carrera 5, sector El Mirador')).toBe('[direccion], [direccion]');
    expect(redact('Carrera 5 con calle 7, casa N° 12')).toBe('[direccion], [direccion]');
    expect(redact('en la av. Libertador frente a la plaza')).toBe('en la [direccion] frente a la plaza');
    expect(redact('urbanización Los Pinos, edificio Pirámide, piso 2')).toBe('[direccion], [direccion], [direccion]');
    expect(redact('vía a San Cristóbal km 8')).toBe('[direccion] [direccion]');
    expect(redact('sector la ermita, barrio el carmen')).toBe('[direccion], [direccion]');
    expect(redact('entre carreras 3 y 4, casa nro. 15-B')).toBe('entre [direccion], [direccion]');
    expect(redact('por la vía al Llano, en la Quinta La Esperanza')).toBe('por la [direccion], en la [direccion]');
    // The house number after N° / nro goes with its street.
    expect(redact('es en la Calle 7 N° 4-23, barrio Obrero')).toBe('es en la [direccion], [direccion]');
    expect(redact('es en la calle 7 nro 4-23')).toBe('es en la [direccion]');
    expect(redact('calle 7, N° 4')).toBe('[direccion]');
  });

  it('una palabra de calle sin nombre ni número no se tapa', () => {
    for (const t of [
      'la vía de publicar es Instagram',
      '¿Qué vía uso para mandar el video?',
      'el sector salud pide piezas',
      'salimos a la calle a grabar',
      'la casa comunal Alto Verde',
      'el piso de arriba',
      'a 5 km del pueblo',
      'envía 3 fotos',
      'Entrega de viviendas en el urbanismo Nuevo Amanecer',
      'Feria de emprendedores en la plaza central',
      // A network or an app after «vía», a field after «sector», a race, an ordinal, a sentence end.
      '¿Lo mando vía WhatsApp?',
      'Publícalo vía Facebook',
      'el sector Salud pide piezas',
      'corrió la Carrera 10K',
      'Quinta Versión del copy',
      'Salimos a la calle. Mañana subo el material',
    ]) {
      expect(redact(t), t).toBe(t);
    }
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

describe('lo que devuelve una herramienta, antes del proveedor', () => {
  it('cada texto pasa por redact(), en objetos y listas (un título puede traer fecha, hora o dirección)', () => {
    const run = { tool: 'buscar_evento', ok: true, result: { eventos: [{ titulo: 'Visita escuela Zamorano jueves 30 a las 9:00 am, calle 3', piezas: 2 }], nota: 'Llamar al 0414-1234567' } };
    const sent = toolMessage(run);
    for (const leak of ['jueves 30', '9:00', 'calle 3', '0414']) expect(sent).not.toContain(leak);
    expect(JSON.parse(sent)).toEqual({ eventos: [{ titulo: 'Visita escuela Zamorano [fecha] a las [hora], [direccion]', piezas: 2 }], nota: 'Llamar al [numero]' });
    expect(toolMessage({ tool: 'estado_pieza', ok: false, error: 'No existe «el 3/11 a las 10:30»' })).toBe(JSON.stringify({ error: 'No existe «el [fecha] a las [hora]»' }));
  });

  it('los títulos con la hora escrita de otras formas tampoco pasan, y lo que redact() no ve lo quita el candado del teléfono', () => {
    const titles = ['Visita escuela Zamorano a las 9.30', 'Acto cancha Zamorano el sábado 8h', 'Jornada Zamorano lunes 3/11 7:00', 'Toma Zamorano 9.30', 'Caravana Zamorano mañana 9.00 am', 'Visita Zamorano 19.30 hrs', 'Toma Zamorano 9.30 hs', 'Acto Zamorano 7.30h'];
    const sent = toolMessage({ tool: 'buscar_evento', ok: true, result: { eventos: titles.map((titulo) => ({ titulo, piezas: 0 })) } });
    for (const leak of ['9.30', '19.', '9.', '7.', '8h', '3/11', '7:00', '9.00', 'sábado', 'lunes', 'mañana', ' am', 'hrs', ' hs']) expect(sent, leak).not.toContain(leak);
    expect(JSON.parse(sent).eventos.map((e: { titulo: string }) => e.titulo)).toEqual([
      'Visita escuela Zamorano a las [hora]',
      'Acto cancha Zamorano el [hora]',
      'Jornada Zamorano [fecha] [hora]',
      'Toma Zamorano', // «9.30» alone: redact() leaves it, stripDateTime takes it
      'Caravana Zamorano [hora]',
      'Visita Zamorano [hora]',
      'Toma Zamorano [hora]',
      'Acto Zamorano [hora]',
    ]);
    // Without that second lock, the alone «9.30» would have gone out.
    expect(redact('Toma Zamorano 9.30')).toBe('Toma Zamorano 9.30');
    // An earlier answer of the demo brain that quotes such a title gets the same lock.
    expect(redactQuoted('El evento «Toma aérea Tariba 9.30» está en «Ficha».')).toBe('El evento «Toma aérea Tariba» está en «Ficha».');
  });

  it('las mejores horas para publicar conservan sus horas; las fechas y direcciones no', () => {
    const run = { tool: 'mejores_horas', ok: true, result: { redes: [{ red: 'Instagram', consejo: 'Mejor 6:00 p. m.–9:00 p. m. · jueves.', nota: 'desde el 3/11, calle 3' }] } };
    expect(JSON.parse(toolMessage(run))).toEqual({ redes: [{ red: 'Instagram', consejo: 'Mejor 6:00 p. m.–9:00 p. m. · jueves.', nota: 'desde el [fecha], [direccion]' }] });
    expect(redactDeep(new Date())).toBe('[fecha]');
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
