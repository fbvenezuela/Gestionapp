// The event-title check on its own (rule 4): what is always refused, what only on the event's day,
// and what ordinary titles keep passing. The actions that use it are in flows-actions.test.ts.
import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { TZ } from '@/lib/time';
import { DATED, alwaysWhen, datedMessage, datedTitle } from '@/lib/domain/event-title';

const day = (iso: string) => DateTime.fromISO(iso, { zone: TZ });
const NOW = day('2027-03-09T10:00'); // «mañana» is then Wednesday 2027-03-10; a year can be 2026 to 2029
const WED = day('2027-03-10');
const SUN = day('2027-03-14');
// What a title gets on a given day: refused always, refused on that day (with or without the place hint), or ok.
const verdict = (title: string, on: DateTime) => {
  if (alwaysWhen(title, NOW)) return 'siempre';
  const hit = datedTitle(title, on, '', NOW);
  return hit ? datedMessage(hit) : 'ok';
};
const hint = (name: string) => `${DATED} Si «${name}» es el nombre del sitio, ponlo en «A dónde se va».`;

describe('siempre se rechaza', () => {
  it('una hora, con o sin sufijo (también la m de «12m» y am/pm)', () => {
    for (const t of [
      'Inauguración a las 9:30 am', 'Acto a las 3 hrs', 'Acto a las 21h', 'Acto 21 hrs', 'Misa de las 7', 'Acto a la una',
      'Acto al mediodía', 'Acto a las nueve de la noche', 'Rueda de prensa a las 10 antes del acto', 'Acto a las 3 llegamos todos',
      'Rueda de prensa a las 12m', 'Acto 12 m.', 'Almuerzo 12m con productores', 'Acto a las 12 m.', 'Acto a las 7am', 'Acto 7 p.m.',
    ]) expect(alwaysWhen(t), t).toBe(true);
  });

  it('dos horas en rango («de 8 a 12», «8-12», «entre 9 y 10»), si no sigue algo que se cuenta', () => {
    for (const t of [
      'Jornada de 8 a 12m', 'Jornada médica 8-12', 'Rueda de prensa entre 9 y 10', 'Jornada 8 a 12', 'Jornada de 8 a 12 m',
      'Jornada de 8 a 12 todos invitados', 'Acto de 10 a 2', 'Jornada desde las 8 hasta las 12', 'Acto (9-10)', 'Jornada 8 – 12',
      'Jornada 8h a 12h', 'Jornada 8am-12m', 'Encuentro entre las 9 y las 10', 'Jornada de ocho a doce',
    ]) expect(alwaysWhen(t), t).toBe(true);
  });

  it('un día de la semana, hoy, y una fecha con un año que se puede agendar (escrita o en números)', () => {
    for (const t of [
      'Acto del sábado', 'Inauguración Viernes', 'Jornada Médica Domingo', 'Acto Domingo 25', 'Domingo de Ramos en la catedral', 'Rueda de prensa hoy',
      'Acto 28/10/2027', 'Acto el 15 de marzo de 2027', 'Acto 15 de marzo del 2027', 'Acto 10 de marzo, 2027', 'Inauguración marzo 10 de 2027',
      'Acto 23 de enero de 2028', 'Acto 15 de marzo de 2026', 'Acto quince de marzo de 2027', 'Acto en la plaza el 28/10',
      'Jornada 8 y 9 de marzo de 2027', 'Jornada del 3 al 10 de marzo de 2029', 'Liceo 5 de Julio 2027',
    ]) expect(alwaysWhen(t, NOW), t).toBe(true);
  });

  it('un rango de horas sigue siendo hora; con un mes detrás son días', () => {
    expect(alwaysWhen('Jornada de 8 a 12 de la mañana', NOW)).toBe(true);
    for (const t of ['Jornada 8 a 12 de marzo', 'Jornada 8-12 de marzo', 'Jornada entre 8 y 12 de marzo']) expect(alwaysWhen(t, NOW), t).toBe(false);
  });
});

describe('pasa: cantidades, sitios y nombres con fecha en un día que no es el suyo', () => {
  it('lo de siempre sigue pasando un miércoles (que aquí es mañana: «Mañana Deportiva» va aparte)', () => {
    for (const t of [
      'Barrio 23 de Enero: entrega de mercados', 'Visita a la Escuela 12 de Octubre', 'Avenida 19 de Abril: asfaltado', 'Sector 4 de Mayo',
      'Liceo 5 de Julio', 'Liceo Cinco de Julio', 'Urbanización 23 de Enero', 'Urbanización Primero de Mayo', 'Plaza 19 de Abril',
      'Visita al 23 de Enero', 'Inauguración de la UBCH 24 de Julio', 'Farmacia 24h en Rubio', 'Concierto Joven 3.0', 'Congreso 2.0 de comunicadores',
      'Encuentro en la Noche de Talentos', 'Jornada de salud 2026', 'Entrega de útiles a las 3 escuelas',
      'Torneo de las siete parroquias', 'Torneo infantil de 8 a 12 años', 'Torneo infantil 8-12 años', 'Charla para grupos de entre 8 y 10 personas',
      'Entrega de 2 a 3 toneladas', 'Encuentro 1 a 1 con productores', 'Visita a Santo Domingo', 'Escuela Domingo Savio: entrega de pupitres',
      'Entrega de 1.200 bolsas', 'Farmacia abierta las 24 horas', 'Puente de 12 metros', 'Las Tres Marías', 'Encuentro en la mañana',
      'Desfile del 5 de julio', 'Acto el 15 de marzo', 'Celebración de los 15 años de la escuela', 'Taller de 2 días con 15 participantes',
      'Jornada 3 a 7 de marzo', 'Feria 8 y 12 de marzo', 'Jornada del 3 al 9 de marzo', 'Desfile 5 de Julio al Liceo 24 de Julio',
    ]) expect(verdict(t, WED), t).toBe('ok');
  });

  it('un año pasado o lejano es una conmemoración, y un número que cuenta algo no es año', () => {
    for (const t of [
      'Acto conmemorativo del 19 de abril de 1810', 'Acto por el 4 de febrero de 1992', 'Aniversario del 23 de enero de 1958',
      'Desfile por el 5 de Julio de 1811', 'Liceo 19 de Abril de 1810', 'Barrio 23 de Enero, 1500 bolsas', 'Urbanización 23 de Enero 3000 familias',
      'Urbanización 23 de Enero 2027 familias', 'Liceo 5 de Julio 1200 alumnos', 'Plaza 19 de Abril - 2000 árboles', 'Acto 15 de marzo de 2025',
      'Acto 15 de marzo de 2030',
    ]) expect(verdict(t, WED), t).toBe('ok');
    // On their own day they still say the date.
    expect(verdict('Acto conmemorativo del 19 de abril de 1810', day('2027-04-19'))).toBe(hint('19 de abril'));
    expect(verdict('Barrio 23 de Enero, 1500 bolsas', day('2027-01-23'))).toBe(hint('23 de Enero'));
  });

  it('«Mañana Deportiva» pasa si el evento no es mañana, y «Escuela Domingo Savio» si no es domingo', () => {
    expect(verdict('Mañana Deportiva en Táriba', SUN)).toBe('ok');
    expect(verdict('Escuela Domingo Savio', WED)).toBe('ok');
    expect(verdict('Visita a Santo Domingo', SUN)).toBe('ok');
  });
});

describe('se rechaza en el propio día del evento', () => {
  it('la fecha escrita de cualquier forma: día y mes, mes y día, ordinal, en letras, con guion o barra', () => {
    const cases: [string, string, string][] = [
      ['Inauguración marzo 10', '2027-03-10', DATED],
      ['Inauguración oct. 28', '2027-10-28', DATED],
      ['Acto primero de marzo', '2027-03-01', hint('primero de marzo')],
      ['Acto 1.º de marzo', '2027-03-01', hint('1.º de marzo')],
      ['Acto 1ro de marzo', '2027-03-01', hint('1ro de marzo')],
      ['Acto del 1ro', '2027-03-01', DATED],
      ['Acto el 1.º', '2027-03-01', DATED],
      ['Acto 23-ene', '2027-01-23', DATED],
      ['Acto 23/ene', '2027-01-23', DATED],
      ['Acto quince de marzo', '2027-03-15', hint('quince de marzo')],
      ['Acto treinta y uno de marzo', '2027-03-31', hint('treinta y uno de marzo')],
      ['Acto el 15 de marzo', '2027-03-15', hint('15 de marzo')],
      ['Visita al ambulatorio 10/3', '2027-03-10', DATED],
      ['Acto del 10', '2027-03-10', DATED],
      ['Barrio 10 de Marzo: entrega de mercados', '2027-03-10', hint('10 de Marzo')],
      ['Urbanización 23 de Enero', '2027-01-23', hint('23 de Enero')],
      ['Escuela Domingo Savio: entrega', '2027-03-14', hint('Domingo Savio')],
    ];
    for (const [t, iso, msg] of cases) expect(verdict(t, day(iso)), t).toBe(msg);
  });

  it('cada día de una lista o de un tramo, también el primero y los del medio', () => {
    const cases: [string, string, string][] = [
      ['Jornada de vacunación 8 al 12 de marzo', '2027-03-08', DATED],
      ['Jornada de vacunación 8 al 12 de marzo', '2027-03-10', DATED],
      ['Jornada de vacunación 8 al 12 de marzo', '2027-03-12', hint('12 de marzo')],
      ['Jornada de vacunación los días 8 y 9 de marzo', '2027-03-08', DATED],
      ['Jornada de vacunación los días 8 y 9', '2027-03-09', DATED],
      ['Feria 8 y 9 de marzo', '2027-03-08', DATED],
      ['Acto 8, 9 y 10 de marzo', '2027-03-09', DATED],
      ['Jornada 3 al 10 de marzo', '2027-03-03', DATED],
      ['Jornada del 3 al 10 de marzo', '2027-03-05', DATED],
      ['Jornada 8-12 de marzo', '2027-03-08', DATED],
      ['Jornada 8 a 12 de marzo', '2027-03-11', DATED],
      ['Jornada entre el 8 y el 12 de marzo', '2027-03-10', DATED],
      ['Jornada desde el 8 hasta el 12', '2027-03-09', DATED],
      ['Jornada 8 al 12', '2027-03-08', DATED],
      ['Jornada marzo 8 al 12', '2027-03-11', DATED],
      ['Jornada del 28 de febrero al 2 de marzo', '2027-03-01', DATED],
      ['Jornada 28 al 2 de marzo', '2027-02-28', DATED],
      ['Jornada del 28 al 2', '2027-03-01', DATED],
      ['Bloque 7, 23 de Enero', '2027-01-07', DATED],
    ];
    for (const [t, iso, msg] of cases) expect(verdict(t, day(iso)), `${t} (${iso})`).toBe(msg);
    // Outside the span, and the month before it, they pass; «8-12 de marzo» is not December 8.
    for (const [t, iso] of [['Jornada del 3 al 10 de marzo', '2027-03-11'], ['Jornada 8-12 de marzo', '2027-12-08'], ['Jornada del 28 al 2', '2027-03-15']]) {
      expect(verdict(t, day(iso)), `${t} (${iso})`).toBe('ok');
    }
  });

  it('«mañana» cuando el evento es mañana, también en mayúsculas o como «Mañana» + nombre', () => {
    for (const [t, msg] of [
      ['Rueda de prensa mañana', DATED],
      ['Rueda de prensa mañana en la gobernación', DATED],
      ['Rueda De Prensa Mañana En La Gobernación', DATED],
      ['MAÑANA: rueda de prensa', DATED],
      ['Acto de mañana', DATED],
      ['Mañana Inauguración del puente', hint('Mañana Inauguración')],
      ['Mañana Deportiva en Táriba', hint('Mañana Deportiva')],
    ]) expect(verdict(t, WED), t).toBe(msg);
    // The morning is not the day after.
    expect(verdict('Encuentro en la mañana', WED)).toBe('ok');
  });
});

describe('quien no ve la fecha no agrega una nueva', () => {
  it('se compara con lo que ya decía el título guardado, no con la fecha', () => {
    const before = 'Barrio 23 de Enero: entrega de mercados';
    expect(datedTitle(`${before} y útiles`, null, before, NOW)).toBeUndefined();
    expect(datedTitle('Mañana Deportiva en Táriba con premios', null, 'Mañana Deportiva en Táriba', NOW)).toBeUndefined();
    for (const t of ['Visita 11 de marzo', 'Visita marzo 11', 'Visita quince de marzo', 'Visita del 11', 'Mañana Deportiva', 'Visita 9 al 11 de marzo']) {
      expect(datedTitle(t, null, 'Visita al ambulatorio', NOW), t).toBeDefined();
    }
  });
});

describe('obras numeradas no son días', () => {
  it('«torres 1 al 4» o «km 8 al 12» pasan aun en esos días; «Jornada 8 al 12» no', () => {
    for (const t of ['Entrega de viviendas torres 1 al 4', 'Entrega de viviendas torre 1 al 4', 'Asfaltado km 8 al 12', 'Bloques 10 al 12 del urbanismo']) {
      for (const d of ['2027-03-10', '2027-03-11', '2027-03-12']) expect(verdict(t, day(d)), `${t} ${d}`).toBe('ok');
    }
    expect(verdict('Jornada de vacunación 10 al 12', WED)).not.toBe('ok');
    expect(verdict('Jornada del 10 al 12', WED)).not.toBe('ok');
  });
});
