// The demo brain with 360's answers (D-89, src/lib/assistant/answers/engine.ts), on the demo database: a real agenda
// trap keeps the refusal even with the screens' labels around it; a rule about the date, a label with a time word or a
// question about Mensajes' rules is answered (static, date-free text); the tools only on their intent (the avisos of
// cumplimiento never run «marcar leídos», a tweet is no piece, the best hours never come back degraded); the counts go to
// the person's list; 360 itself, small talk and off-topic; Mensajes asked to be read or told; the screen; a follow-up;
// what política and the IVT upload. Invented data; one turn per question, under the hourly limit (this file's people).
import { describe, it, expect, beforeAll } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn } from '@/lib/assistant';
import { NOT_SURE, NOT_SURE_ADMIN, secondPerson } from '@/lib/assistant/local';
import { MESSAGES_ADMIN_TEXT, MESSAGES_READ_TEXT, MESSAGES_TELL_TEXT } from '@/lib/assistant/messages-ask';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}

const REFUSAL = /no lo manejo|no la tengo/;
type Expect = { has?: RegExp; not?: RegExp; tool?: string; notTool?: string; go?: string; tutorial?: string; agenda?: true; is?: string; screen?: string; thread?: string[] };
const A: Expect = { agenda: true };

const TABLE: Partial<Record<DemoUserKey, [string, Expect][]>> = {
  camera: [
    // A trap with a label around it, or a label inside it: still the refusal.
    ['¿A qué hora es la feria de «Por ponerle fecha»?', A],
    ['en «Hoy en la agenda» sale la jornada de salud, ¿a qué hora es?', A],
    ['¿Cuál es el teléfono del contacto del sitio de la jornada de salud?', A],
    ['¿puedo saber a qué hora es la jornada de salud?', A],
    // A label with a time word, asked for what it means.
    ['¿Qué sale en «Hoy en la agenda»?', { has: /Hoy en la agenda/ }],
    // A rule: what goes in the note for the editor.
    ['puedo poner en la nota a que hora llego el gobernador', { not: REFUSAL }],
    // The person's own list, counted.
    ['¿qué tengo que subir hoy?', { tool: 'mis_pendientes' }],
    // The screen the person is on, and its tutorial.
    ['que es esto', { screen: '/hoy', has: /Lo que espera por mí/, tutorial: 'hoy-grabacion' }],
    // A follow-up: the next task of the guide.
    ['¿y después?', { thread: ['¿Cómo subo el material?'], has: /entrega|storyboard/i }],
  ],
  dispatch: [
    ['en «Hoy en la agenda» sale la entrega de viviendas, ¿dónde queda?', A],
    ['¿Qué pongo en «A dónde se va»?', { not: REFUSAL }],
    // The curated answer says it in full («las fichas de obra del IVT», D-89).
    ['¿Qué es «Por ponerle fecha»?', { has: /fichas (?:de obra )?del IVT/, not: REFUSAL }],
    ['¿Grabación ve la fecha del evento que le asigné?', { not: REFUSAL }],
    ['se cambio la hora de la entrega de viviendas como la cambio en la plataforma', { has: /«Mover»|«Cambiar fecha o lugar»/, not: REFUSAL }],
  ],
  boss: [
    ['¿Dónde queda la escuela Los Andes? Lo necesito para «Horas de silencio»', A],
    ['a que hora nos va mejor publicando', { tool: 'mejores_horas' }],
    ['¿Puedo poner la hora en el título del evento?', { has: /^No/, not: REFUSAL }],
    ['¿Puedes publicar por mí?', { has: /^No: yo no publico/ }],
    ['¿Cómo estás?', { has: /Todo bien|Bien, gracias/ }],
    ['resumeme lo que hablaron en el canal de obras y comunidad', { is: MESSAGES_READ_TEXT, go: '/mensajes' }],
    // The boss's curated answer («Tú o el despacho: en «Por ponerle fecha»…») or the guide's task («Ponerle fecha»).
    ['¿Cómo le pongo fecha a una ficha de obra?', { has: /[Pp]onerle fecha/, not: REFUSAL }],
  ],
  social: [
    ['puedo borrar un aviso de cumplimiento', { notTool: 'marcar_avisos_leidos' }],
    ['si edito un tweet que ya aprobaron que pasa', { notTool: 'estado_pieza', has: /vuelve al jefe/ }],
    ['a que hora publico los tweets', { tool: 'mejores_horas', has: /^X:/ }],
    ['como hago una historia para instagram', { notTool: 'mejores_horas', not: /Mejores horas/ }],
    ['por que no veo la fecha de los eventos', { has: /seguridad|sin fecha/, not: REFUSAL }],
    ['vaciar este mes borra todo?', { screen: '/redes/feed', has: /Sin programar|no se borra/, not: REFUSAL }],
    ['avisale al jefe que ya mande la pieza a aprobacion', { is: MESSAGES_TELL_TEXT, go: '/mensajes' }],
  ],
  social2: [
    ['eres bien bruto', { has: /algo no salió bien/ }],
    // After a question about an event, «¿y a qué hora es?» is the agenda.
    ['y a que hora es', { thread: ['¿cómo va lo de la cancha?'], ...A }],
  ],
  politics: [
    ['¿Qué sabes hacer?', { has: /No leo Mensajes/ }],
    ['¿cuántas vencidas tengo?', { tool: 'mis_pendientes' }],
    ['¿Por qué no me sale la fecha de mi actividad?', { not: REFUSAL }],
    ['¿Cómo hago para que no me suene el teléfono de noche?', { has: /Horas de silencio/, not: REFUSAL }],
    ['mandale un msj al jefe q ya cargue la ficha', { is: MESSAGES_TELL_TEXT }],
    // Política uploads the evidencias of its ficha (not «desde tu rol no se sube material»).
    ['como subo las fotos del antes', { screen: '/reportes/[id]', has: /Subir fotos del antes/, not: /no se sube material/ }],
  ],
  ivt: [
    ['¿Quién ve lo que te pregunto?', { has: /Administración ve lo que me preguntas/ }],
    ['grax pana', { not: /No estoy seguro/ }],
    ['¿Va a llover hoy en San Cristóbal?', { has: /se me escapa|no opino/ }],
    ['cuantas obras esperando fecha tengo', { tool: 'mis_pendientes' }],
    ['¿Puedo poner la fecha de la visita en el nombre de la obra?', { not: REFUSAL }],
  ],
  admin: [
    ['¿Quién ve lo que le preguntan a 360?', { has: /Conversaciones/ }],
    ['que es esto', { screen: '/ajustes/contenido', has: /cupo del mes/i }],
    // Administración is never offered to tell administración.
    ['como cocino una arepa', { is: NOT_SURE_ADMIN }],
  ],
};

// The engine classes found by the content tuners (D-89, second pass): each one with the step that used to answer first.
const CLASSES: Partial<Record<DemoUserKey, [string, Expect][]>> = {
  boss: [
    // «lo de …» names a thing of the platform, not an event: no event lookup.
    ['lo de los copies como funciona', { notTool: 'buscar_evento', not: REFUSAL }],
    // The agenda's how-tos and labels are answered, not refused, and not «La Agenda está en el menú».
    ['¿cómo veo la agenda por semana?', { has: /«Semana»/, not: /La Agenda está en el menú/ }],
    ['¿qué significan los colores de la agenda?', { has: /«Aceptado»/, not: REFUSAL }],
    // A strong answer about one screen keeps its own button instead of the bare «Te dejo el botón para ir».
    ['¿dónde le cambio el nivel a una pieza?', { has: /«Cambiar nivel»/ }],
    // Mensajes: a channel is the boss's to create, with his steps.
    ['como creo un canal', { has: /«Nuevo canal»/ }],
    // «pendiente» or «decidir» in a how-it-works question: no list.
    ['que significa pendiente en la tarjeta', { notTool: 'mis_pendientes' }],
    ['como funciona lo de decidir los eventos', { notTool: 'eventos_por_decidir' }],
    // The boss uploads like Redes, on the event's Material tab.
    ['como subo el video del acto', { has: /Material/, not: /pásaselo a Redes/ }],
    // The support step is for support: «teléfono» alone is not; «los números de arriba» are not Mi perfil.
    ['algo de un teléfono', { not: /No hay teléfono de soporte/ }],
    ['que son los números de arriba en mi inicio', { not: /Mi perfil/, screen: '/jefe' }],
    // The tutorial of what is named.
    ['¿hay tutorial para crear eventos?', { tutorial: 'nuevo-evento' }],
    ['enséñame la agenda', { screen: '/agenda', tutorial: 'agenda-calendario' }],
    // Filler only: the guide's own answer.
    ['¿qué no debo hacer nunca?', { has: /«Antes de aprobar»/ }],
    // «¿Quién…?» answered in «tú»; «Quién graba» named in a question is a label.
    ['quien aprueba los tweets', { has: /^Tú/ }],
    // A speech is not written for him: where it comes from instead.
    ['escribeme un discurso para la inauguracion del hospital', { has: /diálogo FAB|Lo que voy a decir/, not: REFUSAL }],
    // Traps said other ways, with labels around them.
    ['¿me avisas a qué hora llega el jefe a la cancha?', A],
    ['si guardo la ficha, ¿a qué hora es la feria?', A],
    ['qué es «Hoy en la agenda»? y a qué hora es lo de la cancha', A],
    // (last pass) The guide's own curated answer, with its tutorial of Ayuda, not the bare «Te dejo el botón para ir».
    ['¿Dónde está mi guía?', { has: /«Mi trabajo, paso a paso»/, not: /Te dejo el botón para ir/ }],
    // «¿Rubén puede…?» asks whether another person may, not for the list of events waiting.
    ['¿Rubén puede aceptar eventos?', { notTool: 'eventos_por_decidir', has: /^No: decidir es solo tuyo/ }],
    // Pieces counted when it says pieces (all of them, not the whole list).
    ['¿cuántas piezas tengo por aprobar?', { tool: 'mis_pendientes', has: /^Tienes \d+ piezas? por aprobar/ }],
    // «vale y…» opens a «¿cómo…?»: the answer that says how he knows, not the «No:» of another question.
    ['vale y ¿cómo sé si Redes ya publicó lo que aprobé?', { has: /«Publicado»/ }],
    // «5 min» and «reuniones» are not the agenda: what goes first in his Inicio.
    ['chamo tengo 5 min entre reuniones, ¿qué es lo más urgente?', { has: /«Te toca aprobar»/, not: /No estoy seguro/ }],
  ],
  dispatch: [
    ['que es Guardar aunque choque', { has: /choca/, not: REFUSAL }],
    ['que es lo de esperan al jefe en hoy', { screen: '/hoy', has: /decisión del jefe/, not: REFUSAL }],
    ['donde esta lo de por ponerle fecha', { go: '/agenda/por-fecha', not: REFUSAL }],
    ['como pongo quien graba en el evento', { has: /Quién graba/ }],
    ['¿La importancia del 1 al 10 la pongo yo?', { has: /^No/, not: REFUSAL }],
    ['que dice como se llega en la feria', A],
    ['¿Cuándo va el gobernador a la escuela Los Andes?', A],
    // (last pass) The Enter key is the answers', not «¿cómo le escribo a alguien?»; the site's phones as a field, not one event's.
    ['le doy enter y no se manda el mensaje', { has: /Enter hace un salto de línea/ }],
    ['¿cómo funcionan los tutoriales?', { has: /«Siguiente» y «Atrás»/ }],
    ['¿dónde van los teléfonos del sitio?', { has: /«Contactos del sitio»/, not: REFUSAL }],
    ['¿dónde van los teléfonos del sitio de la feria?', A],
  ],
  social: [
    ['como archivo un canal', { has: /jefe/, not: /^Mensajes está en el sobre/ }],
    ['me sale Enviar igual o Corregir que hago', { has: /Enviar igual/, not: /^Mensajes está en el sobre/ }],
    ['¿cuánto dura una historia?', { tool: 'reglas_de_video', has: /Instagram y Facebook/, not: /¿Para qué red\?/ }],
    ['kevin me pregunto si el acto de las viviendas es mañana o pasado, tu sabes?', A],
    ['chamo pasame la direccion del acto d mañana', A],
    // (last pass) The copy too long with no network: how to fix it; with a network, its limit.
    ['me sale que el copy es muy largo', { notTool: 'reglas_de_video', has: /«No pasa»/ }],
    ['me sale un error que dice que el copy es muy largo para x', { tool: 'reglas_de_video', has: /caracteres/ }],
    // Who reads a piece's note (not what is asked to 360).
    ['¿quién ve lo que escribo en la nota de una pieza?', { has: /Redes, el jefe y administración/, not: /Administración ve lo que me preguntas/ }],
    // «¿Se publica solo…?» is a rule, also with «la hora que puse»; next to the feria it says no hour either.
    ['¿se publica solo a la hora que puse?', { has: /a mano/ }],
    ['¿se publica solo a la hora que empieza la feria?', { has: /a mano/ }],
    ['¿qué dijo Kevin en el canal de Redes?', { is: MESSAGES_READ_TEXT }],
    ['¿a qué hora empieza la feria? quiero publicar justo ahí', A],
  ],
  camera: [
    ['tengo dos eventos seguidos, cual es primero', A],
    ['donde stan mis eventos', { go: '/agenda', not: REFUSAL }],
    ['pa q es «Quién graba»? y a q hora es la jornada de salud', A],
    // (last pass) A question about the tutorials themselves; the GPS of a photo is no event's place.
    ['¿cómo salgo de un tutorial?', { has: /«Salir del tutorial»/ }],
    ['¿la foto que subo lleva la ubicación del GPS?', { has: /sin ubicación/, not: REFUSAL }],
    ['¿la ubicación de la jornada de salud me la pasas?', A],
    ['me equivoqué de casilla cuando fui a la cancha, ¿a qué hora es?', A],
  ],
  ivt: [
    ['a quien llamo cuando llegue a la obra', A],
    ['la gente de la comunidad me pregunta cuando viene el gobernador q les digo', A],
    ['¿Cómo le mando la ficha al jefe cuando ya está lista?', { has: /«Guardar y avisar al jefe»/, not: REFUSAL }],
    ['q me falta x hacer hoy', { tool: 'mis_pendientes' }],
    // (last pass) Thanks and then a question: the question. «Cuando fui a entrar» is no event's when.
    ['gracias, y ¿cómo cambio mi nombre?', { has: /«Nombre»/ }],
    ['me equivoqué de correo cuando fui a entrar', { has: /«Usar otro correo»/, not: REFUSAL }],
    ['las fotos que subo llevan la ubicación del teléfono', { has: /sin la ubicación/, not: REFUSAL }],
    ['kien decide si el jefe va a mi obra', { has: /«Por ponerle fecha»/, not: /^Jefe: tiene todo/ }],
    ['saqué una obra del archivo, ¿a dónde fue a parar?', { has: /«Borradores»/, not: REFUSAL }],
    ['¿a dónde fue el jefe? me dijeron que a la obra de la escuela', A],
  ],
  politics: [
    ['si guardo sin mandarlo al jefe donde queda', { not: REFUSAL }],
    ['redes puede ver mis reportes? no quiero q vean los datos de la gente', { has: /^No/ }],
    // (last pass) «dónde la tomé» is no event's place; a greeting before a question; the date of one's report keeps the refusal.
    ['¿se ve en la foto dónde la tomé?', { has: /sin la ubicación/, not: REFUSAL }],
    ['epa como reporto un bote de aguas negras', { has: /ficha comunitaria/, not: /^¡Hola/ }],
    ['¿y sabes la fecha de mi reporte?', A],
  ],
  admin: [
    // (last pass) Tutorials: how they work and «Ver como» are the answers'; administración's screens have none.
    ['¿los tutoriales cambian si uso Ver como?', { has: /siguen «Ver como»/ }],
    ['hay tutorial de ajustes', { has: /no tienen tutorial/ }],
    ['muéstrame cómo se usa esta pantalla', { screen: '/ajustes/equipo', has: /no tienen tutorial/, not: /^Sí/ }],
    // Its guide, with the guide's own button; the guide without signal is a problem, not the way to Ayuda.
    ['¿Dónde está mi guía?', { has: /«Guía de administración»/, go: '/ayuda/administracion' }],
    ['la guía no me abre sin internet', { has: /necesitan señal/ }],
    // Mensajes in the Registro de cambios or in «Conversaciones»: rules, answered; reading a channel is still refused.
    ['¿El registro de cambios muestra lo que escriben en Mensajes?', { has: /Nunca el texto/ }],
    ['alguien le preguntó a 360 qué decía un mensaje y en Conversaciones no sale el texto, ¿por qué?', { has: /se guarda sin el texto/ }],
    ['léeme los mensajes del canal de Redes', { is: MESSAGES_ADMIN_TEXT }],
    // The state of an invitation, the «Cómo va» tab and an error that quotes a rule are no tool and no support.
    ['la invitación sigue pendiente', { notTool: 'mis_pendientes', has: /«Invitaciones sin aceptar»/ }],
    ['¿qué muestra la pestaña Cómo va?', { screen: '/ajustes/asistente', notTool: 'estado_pieza', has: /«Cómo va» muestra/ }],
    ['me salió un error que dice administración no puede ser también el jefe ni el despacho', { has: /^Es la regla/, not: /teléfono de soporte/ }],
    // Redes' cards say less than these.
    ['¿Fin de mes tiene cupo?', { has: /^No: fin de mes no tiene cupo/ }],
    ['donde se guardan los videos', { has: /Drive/, not: REFUSAL }],
    ['¿qué es piezas eliminadas?', { has: /«Recuperar»/ }],
  ],
};

let secrets: string[] = [];
beforeAll(async () => {
  const rows = await withSystem((sql) =>
    sql.query<{ starts_at: Date; exact_address: string; directions: string; site_contacts: string }>(`select starts_at, exact_address, directions, site_contacts from public.event_schedule`),
  );
  secrets = rows.flatMap((r) => [r.exact_address, r.directions, r.site_contacts, new Date(r.starts_at).toISOString().slice(0, 16)]).filter((x) => x && x.length > 3);
  expect(secrets.length).toBeGreaterThan(5);
});

describe('360 con sus respuestas: la negativa solo para la agenda de verdad, y cada pregunta a lo suyo', () => {
  for (const [table, name] of [[TABLE, 'cada pregunta tiene lo suyo'], [CLASSES, 'lo que antes contestaba otro paso']] as const)
  for (const [role, rows] of Object.entries(table) as [DemoUserKey, [string, Expect][]][]) {
    it(`${role}: ${name}`, async () => {
      for (const [q, e] of rows) {
        let conversationId: string | null = null;
        for (const t of e.thread ?? []) conversationId = (await handleTurn(sessionOf(role), { question: t, conversationId, screen: e.screen }, { chain: [] })).conversationId;
        const r = await handleTurn(sessionOf(role), { question: q, conversationId, screen: e.screen }, { chain: [] });
        const who = `${role}: ${q} → ${r.answer}`;
        const tools = r.did.map((d) => d.tool);
        expect(r.model, who).toBe('local');
        expect(r.degraded, who).toBe(false);
        for (const s of secrets) expect(r.answer, who).not.toContain(s);
        if (e.agenda) {
          expect(r.answer, who).toMatch(REFUSAL);
          expect(tools.filter((t) => t !== 'buscar_evento'), who).toEqual([]);
          continue;
        }
        if (!tools.some((t) => t === 'mejores_horas' || t === 'reglas_de_video')) expect(r.answer, who).not.toMatch(/\b\d{1,2}:\d{2}\b/);
        if (e.is) expect(r.answer, who).toBe(e.is);
        if (e.has) expect(r.answer, who).toMatch(e.has);
        if (e.not) expect(r.answer, who).not.toMatch(e.not);
        if (e.tool) expect(tools, who).toContain(e.tool);
        if (e.notTool) expect(tools, who).not.toContain(e.notTool);
        if (e.go) expect(r.goTo?.href, who).toBe(e.go);
        if (e.tutorial) expect(r.tutorial?.id, who).toBe(e.tutorial);
      }
    });
  }

  it('la ficha de rol dicha en «tú» no conjuga «Para qué:» ni lo que hace una cosa', () => {
    expect(secondPerson('Para qué: grabar los eventos asignados. Ve solo los eventos que le asignaron; no sale hasta que la vuelva a aprobar.')).toBe(
      'Para qué: grabar los eventos asignados. Ves solo los eventos que le asignaron; no sale hasta que la vuelva a aprobar.',
    );
  });

  it('un «no estoy seguro» del equipo sigue ofreciendo avisar a administración', async () => {
    const r = await handleTurn(sessionOf('camera'), { question: 'como cocino una arepa' }, { chain: [] });
    expect(r.answer).toBe(NOT_SURE);
  });
});
