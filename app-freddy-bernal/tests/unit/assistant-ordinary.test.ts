// Ordinary questions, as people ask them (also dictated, without accents), through the demo brain (no
// AI: the real demo has no model chain) on the demo database, role by role (round 5). Each one has its
// expected tool, screen («Ir a») or key phrase: pending decisions go to their tool, «¿dónde está X?» to
// the screen and its button, how-tos to the right ficha, a weak match to «No estoy seguro…», and an
// agenda question only ever to the refusal. Invented data; one turn per question, under the hourly limit.
import { describe, it, expect, beforeAll } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn } from '@/lib/assistant';
import { NOT_SURE, NOT_SURE_ADMIN } from '@/lib/assistant/local';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}

// tool: a tool it must use; notTool: one it must not use; go: the «Ir a» screen; has: words the answer must
// carry; agenda: the refusal and nothing else; unsure: «No estoy seguro…» (no ficha answers it well).
type Expect = { has?: RegExp; tool?: string; notTool?: string; go?: string; agenda?: true; unsure?: true };
// Round 6: how a change to an event in general is done (its place too), the cambiar-evento ficha.
// Since the answers (D-89), also the guide's own step («Mover», «Cambiar fecha o lugar»).
const CHANGE: Expect = { has: /cambian el título, el lugar, la fecha|«Mover»|«Cambiar fecha o lugar»/ };
const REFUSAL = /no lo manejo|no la tengo/;
const A: Expect = { agenda: true };

const TABLE: Partial<Record<DemoUserKey, [string, Expect][]>> = {
  admin: [
    ['¿Qué tengo pendiente?', { tool: 'mis_pendientes', has: /pendiente/ }],
    ['¿Cómo invito a alguien nuevo?', { has: /Equipo.*Invitar/, go: '/ajustes/equipo' }],
    ['donde esta la biblioteca', { go: '/biblioteca', has: /^Biblioteca: .*Te dejo el botón para ir\.$/ }],
    ['¿Dónde está el registro de cambios?', { go: '/ajustes/registro', has: /quién hizo qué/ }],
    ['¿Dónde veo los correos que mandó la plataforma?', { go: '/ajustes/buzon', has: /Buzón/ }],
    ['¿Cómo edito las fórmulas de copies?', { go: '/ajustes/formulas' }],
    ['¿Dónde cambio los horarios de los tweets?', { go: '/ajustes/horarios' }],
    ['llevame a ajustes', { go: '/ajustes' }],
    // D-89: administración's curated steps («Cambiar» → «Desactivar»).
    ['¿Cómo le quito el acceso a alguien?', { has: /«Desactivar»|desactiva a quien ya no está/ }],
    // D-89 (second pass): the curated answer says where in one line («Tú, en Ajustes → Equipo → «Cambiar»…»).
    ['¿Cómo cambio el rol de alguien?', { has: /«Cambiar»/ }],
    ['¿Cómo le cierro la sesión a alguien que perdió el teléfono?', { has: /«Cerrar sus sesiones»/ }],
    ['¿Qué es el buzón?', { has: /Buzón \(todos los correos|Buzón de correos»?: todos los correos/ }],
    ['¿Cómo confirmo un aviso que preparó el asistente?', { has: /[Pp]or confirmar/ }],
    ['Marca mis avisos como leídos', { tool: 'marcar_avisos_leidos' }],
    ['¿Cuántos días de tweets quedan?', { tool: 'dias_de_tweets', has: /tweets/ }],
    ['¿Puedo aprobar una pieza?', { has: /^No(?: apruebas piezas|: todo lo aprueba el jefe)/ }],
    // Administración's curated answer (D-89): Marca shows the logo, but it is not changed there.
    ['como cambio el logo', { has: /no se cambian/ }],
    ['¿A qué hora es la feria?', A],
    // Round 6: the more specific screen named, and «quién hizo qué».
    ['donde veo los avisos que dejo preparados el asistente', { go: '/ajustes/asistente', has: /^El panel del asistente: .*por confirmar|«Por confirmar»/ }],
    ['donde veo quien borro una pieza', { go: '/ajustes/registro', has: /quién hizo qué/ }],
  ],
  boss: [
    ['¿Qué me toca aprobar?', { tool: 'mis_pendientes', has: /aprobar/ }],
    ['¿Cuántos eventos tengo por calificar?', { tool: 'eventos_por_decidir', go: '/jefe/politica', has: /esperando tu decisión/ }],
    ['¿Qué eventos esperan mi decisión?', { tool: 'eventos_por_decidir', go: '/jefe/politica', has: /esperando tu decisión/ }],
    ['que eventos tengo por decidir', { tool: 'eventos_por_decidir', has: /calificas de 1 a 10/ }],
    ['cuantas piezas tengo por aprobar', { tool: 'mis_pendientes', has: /aprobar/ }],
    ['¿Qué tengo hoy?', { tool: 'mis_pendientes' }],
    // D-89: his curated steps («En «Tu decisión» elige la importancia de 1 a 10»).
    ['¿Cómo acepto un evento?', { has: /Política.*(?:califica|importancia) de 1 a 10/ }],
    ['¿Cómo rechazo una propuesta?', { has: /«Rechazar»|«¿Rechazar este evento\?»/ }],
    ['¿Dónde veo cómo nos va?', { go: '/resultados' }],
    ['¿Dónde está Política?', { go: '/jefe/politica' }],
    ['¿Dónde leo lo que voy a decir?', { go: '/jefe/politica' }],
    ['¿Qué es «Lo que voy a decir»?', { has: /letra grande/ }],
    // D-89 (second pass): his curated steps, with the list «Antes de aprobar».
    ['¿Cómo apruebo una pieza en rojo?', { has: /lista de chequeo|«Antes de aprobar»/ }],
    ['¿Cómo pido cambios en una pieza?', { has: /[Pp]edir cambios/ }],
    ['¿Puedo aprobar las verdes?', { has: /^Apruebas todo lo que sale: las verdes, todas de una vez|«Aprobar todas las verdes \(n\)»/ }],
    ['¿Cómo saco una pieza del rojo?', { has: /sacarla del rojo/ }],
    ['¿Cómo va la pieza del agua?', { tool: 'estado_pieza', has: /Aclaratoria/ }],
    ['a que hora es el acto de mañana', A],
    // Round 6: how-tos about tweets and pieces go to the fichas; a screen of his own first.
    // Since the answers (D-89), the boss may get his own step («toca «Aprobar marcados»»).
    ['quien aprueba los tweets', { has: /^Tú: todo lo que sale lo apruebas tú|Jefe: .*aprueba todo lo que sale .*tweets|«Aprobar marcados»/, notTool: 'dias_de_tweets' }],
    ['que reviso antes de aprobar una pieza en rojo', { has: /lista: cifras con fuente|«Antes de aprobar»/, notTool: 'estado_pieza' }],
    ['donde veo lo que se publico', { go: '/jefe/digital' }],
    // Since 27/10/2026 the boss approves everything (what Supervisión did is his).
    ['¿Cómo apruebo las verdes de una vez?', { has: /«Te toca aprobar».*«Aprobar todas las verdes \(n\)»/ }],
    // His approvals come by level (red, yellow, green): since R4 the demo has a red and three yellow ones first.
    ['¿Cuántas piezas tengo en verde?', { tool: 'mis_pendientes', has: /Lo primero: te toca aprobar \(rojo\): «[^»]+», te toca aprobar \(amarillo\)/ }],
    ['¿Qué reviso antes de aprobar?', { has: /lista: cifras con fuente|«Cada cifra tiene su fuente»/ }],
    ['¿Dónde está el botón de aprobar?', { go: '/aprobar', has: /botón Aprobar/ }],
    ['donde apruebo', { go: '/aprobar' }],
    ['¿Dónde se ve el semáforo?', { go: '/aprobar' }],
    ['¿Qué pasa si no apruebo a tiempo?', { has: /La falta de respuesta no es aprobación|sigue sin aprobar/ }],
    ['¿Cómo apruebo los tweets?', { has: /El jefe los aprueba|«Aprobar marcados»/ }],
    ['¿Cómo pido cambios en un copy?', { has: /piden cambios con un comentario|«Pedir cambios»/ }],
    ['¿Cómo subo una pieza a rojo?', { has: /se sube a rojo|«Cambiar nivel»/ }],
    ['que significa el rojo', { has: /rojo, como todas, las aprueba el jefe|nivel rojo/ }],
    ['¿Dónde están los tweets?', { go: '/tweets' }],
    // R3 (design §8.2): «política» is not off topic any more (the boss's Política screen). The tutorials, the screen
    // the person is on and Mensajes are in assistant-help.test.ts (each file has its own hourly limit).
    // His curated steps (D-89): «En el evento, en «Tu decisión», tocas un número del 1 al 10…».
    ['¿Cómo califico los eventos en Política?', { has: /califica de 1 a 10|del 1 al 10/ }],
    ['¿qué opinas de la política?', { has: /se me escapa|no opino/ }],
  ],
  dispatch: [
    ['¿Qué fichas tengo incompletas?', { tool: 'mis_pendientes', has: /ficha/ }],
    // D-89: despacho's curated steps come with their tutorial (its button replaces «Ir a…»).
    ['¿Cómo creo un evento?', { has: /«Nuevo evento».*«Guardar evento»|Nuevo evento/ }],
    ['¿Cómo duplico un evento?', { has: /No hay botón para duplicar/ }],
    // The boss and despacho cancel from the event's page («Cancelar», with its reason) and bring it back (cambios del 27/10).
    ['¿Cómo cancelo un evento?', { has: /«Cancelar»/ }],
    ['¿Cómo borro un evento?', { has: /lo hace Administración, que también lo puede restaurar|se cancela/ }],
    ['¿Cómo cambio la fecha de un evento?', CHANGE],
    ['¿Cómo asigno a quien graba?', { has: /Quién graba/ }],
    ['¿Cómo cambio quién graba un evento?', { has: /Quién graba/ }],
    ['¿Cómo marco un evento como realizado?', { has: /realizado/ }],
    ['¿Qué lleva una ficha técnica?', { has: /[Pp]rotocolo/ }],
    ['¿Dónde veo el calendario?', { go: '/agenda' }],
    ['¿Dónde está la biblioteca?', { go: '/biblioteca' }],
    ['¿Cuántos eventos esperan la decisión del jefe?', { tool: 'eventos_por_decidir', has: /decisión del jefe/ }],
    ['¿Puedo ver las piezas?', { has: /^No/ }],
    ['¿Cómo descargo el material de un evento?', { has: /descargar el material|«Descargar todo»/ }],
    ['¿Qué pasa si dos eventos chocan?', { has: /choca/ }],
    ['¿Dónde queda la escuela Los Andes?', A],
    // Round 6: «¿cómo hago…?» is how one is created; the place of an event in general is a how-to too.
    // Despacho's curated steps (D-89), with the tutorial (its button replaces «Ir a…»).
    ['como hago un evento nuevo', { has: /^Para crear un evento|«Nuevo evento»/ }],
    ['como veo los eventos pasados', { has: /Biblioteca/ }],
    ['que tengo que llenar en la ficha tecnica', { has: /protocolo|Completar la ficha técnica|«Ficha técnica»/, notTool: 'mis_pendientes' }],
    ['como cambio el lugar de un evento', CHANGE],
    ['como cambio el lugar del evento', CHANGE],
    ['como cambio la direccion de un evento', CHANGE],
    ['como le cambio el sitio a un evento', CHANGE],
    ['como cambio mi numero de telefono', { has: /Mi perfil/, go: '/perfil' }],
  ],
  // Director de política and Director del IVT (27/10/2026): no dates, no content; their screens come next.
  politics: [
    // Its overdue reports, as on its Municipios (the demo has one).
    ['¿Qué tengo pendiente?', { tool: 'mis_pendientes', has: /vencida: «.+»\. Todo eso está en Municipios/ }],
    ['¿Qué puedo hacer yo en la plataforma?', { has: /registro de cada municipio/ }],
    ['¿Puedo ver la agenda?', { has: /no está en tu menú/ }],
    ['¿Dónde está la agenda?', { has: /no está en tu menú/ }],
    // D-89: the curated answers, said for everyone or for política.
    ['¿Puedo ver las piezas?', { has: /^No ves la agenda con fecha y hora, ni piezas|los demás roles no|^No/ }],
    ['¿Quién decide si se hace un evento?', { has: /Jefe: tiene todo|^El jefe/ }],
    ['¿Quién aprueba las piezas?', { has: /el jefe las aprueba|aprueba el jefe/ }],
    ['¿Qué es el doble factor?', { has: /el director de política|código de tu teléfono/ }],
    ['¿Cómo cambio mi contraseña?', { has: /[Nn]o hay contraseñas/ }],
    ['no me llega el codigo', { has: /^Si no llega el código: revisa spam|spam/ }],
    ['¿Cómo instalo la app en el teléfono?', { has: /pantalla de inicio/ }],
    ['¿Cómo activo los avisos?', { has: /«Activar avisos»/ }],
    ['¿Dónde veo mis avisos?', { go: '/avisos' }],
    ['Marca mis avisos como leídos', { tool: 'marcar_avisos_leidos' }],
    ['¿Dónde es la reunión con los productores?', A],
    ['¿Cuándo es la feria?', A],
    ['como llego a alto verde', A],
  ],
  ivt: [
    // Its obra drafts and how many wait for a date, as on its Obras (never the date).
    ['¿Qué tengo pendiente?', { tool: 'mis_pendientes', has: /ficha de obra en borrador: «.+».*Todo eso está en Fichas de obra/ }],
    ['¿Qué puedo hacer yo en la plataforma?', { has: /ficha de cada obra/ }],
    ['¿Qué hace el director del IVT?', { has: /ficha de cada obra/ }],
    // «Mis visitas de obra» (the shared agenda): the dates of the visits to its obras only.
    ['¿Puedo ver la agenda?', { has: /La Agenda está en el menú/ }],
    ['¿Puedo ver las piezas?', { has: /^No ves piezas, copies, tweets ni publicaciones|los demás roles no|^No/ }],
    ['¿Quién decide si se hace un evento?', { has: /Jefe: tiene todo|^El jefe/ }],
    ['¿Qué es el doble factor?', { has: /el director del IVT|código de tu teléfono/ }],
    ['¿Cómo cambio mi contraseña?', { has: /[Nn]o hay contraseñas/ }],
    ['no me llega el codigo', { has: /^Si no llega el código: revisa spam|spam/ }],
    ['¿Cómo instalo la app en el teléfono?', { has: /pantalla de inicio/ }],
    ['¿Cómo activo los avisos?', { has: /«Activar avisos»/ }],
    ['¿Dónde veo mis avisos?', { go: '/avisos' }],
    ['Marca mis avisos como leídos', { tool: 'marcar_avisos_leidos' }],
    ['¿A qué hora es el recorrido del puente?', A],
    ['¿Dónde queda la escuela Los Andes?', A],
    // A rule about the date, not a date (D-89): who puts it, said by the guide.
    ['¿Puedo poner la fecha de la visita?', { has: /^No puedes poner la fecha/ }],
    ['como llego a alto verde', A],
  ],
  social: [
    ['¿Qué tengo pendiente?', { tool: 'mis_pendientes', has: /pendiente/ }],
    ['¿Cuántos días de tweets quedan?', { tool: 'dias_de_tweets', has: /tweets/ }],
    ['¿A qué hora publico en TikTok?', { tool: 'mejores_horas', has: /TikTok/ }],
    ['¿Por qué no me deja publicar esta pieza?', { has: /no está aprobada/ }],
    ['¿Cómo creo una pieza?', { has: /Nueva pieza/ }],
    // D-89: ««Generar copies» en la tarjeta te lleva a «Copies»…».
    ['¿Cómo hago los copies?', { has: /(?:en|a) «Copies»/ }],
    ['¿Dónde están las plantillas de copies?', { has: /en «Copies»/ }],
    ['hay un error en el copy, ¿cómo lo corrijo?', { has: /en «Copies»|corrige los copies/ }],
    ['¿Cómo mando a aprobar una pieza?', { has: /«Enviar a aprobación»/ }],
    ['¿Qué color le pongo a la pieza?', { has: /[Vv]erde si es rutina/ }],
    ['¿Cómo subo la tanda de tweets?', { has: /nueva tanda|tanda nueva|«Separar tweets»/ }],
    ['¿Cómo registro lo que publicó el jefe?', { has: /[Ll]o que publicó el jefe/ }],
    ['¿Cómo cargo las métricas?', { has: /CSV/ }],
    // D-89: the network's limit of characters (the video rules tool says each network's).
    ['me salió un error que dice que el copy es muy largo', { tool: 'reglas_de_video' }],
    ['me sale un error que dice que el video pesa mucho', { tool: 'reglas_de_video' }],
    ['¿Cuánto puede durar un reel?', { tool: 'reglas_de_video', has: /segundos/ }],
    ['donde publico a mano', { go: '/publicar' }],
    ['¿Cuándo es la feria?', A],
    // Round 6: the way to an event's place (a word of it is also a ficha's tag: «verde»), «¿qué tengo
    // que…?» how-tos, tweets and pieces that are not a count or a status.
    ['como llego a alto verde', A],
    ['como llego a la casa comunal alto verde', A],
    ['que tengo que poner en el copy', { has: /en «Copies»|«Poner en el copy»/, notTool: 'mis_pendientes' }],
    ['que tengo que hacer para publicar', { has: /^En Publicar|^Publicar a mano/, notTool: 'mis_pendientes' }],
    ['que tengo que hacer', { tool: 'mis_pendientes' }],
    ['que pasa si un tweet es muy largo', { has: /largos|«Partir»/, notTool: 'dias_de_tweets' }],
    ['cuantos tweets salen por dia', { has: /2 [oa] 3 por día/, notTool: 'dias_de_tweets' }],
    ['puedo editar un tweet ya aprobado', { notTool: 'dias_de_tweets' }],
    ['que significa que una pieza este trancada', { has: /Trancado/, notTool: 'estado_pieza' }],
    ['una pieza puede tener varias versiones', { has: /versión|«Archivo final»/, notTool: 'estado_pieza' }],
    ['cuanto tiempo tiene una pieza para aprobarse', { notTool: 'estado_pieza' }],
    ['cuantos caracteres puede tener el copy en x', { tool: 'reglas_de_video', has: /caracteres/ }],
  ],
  camera: [
    ['¿Qué tengo pendiente?', { tool: 'mis_pendientes', has: /pendiente/ }],
    ['¿Cómo subo el material?', { has: /Material.*casilla/ }],
    ['como subo las fotos', { has: /pestaña «?Material|en «Material»/ }],
    ['¿Qué pasa si se va la señal subiendo un video?', { has: /sigue sola/ }],
    ['¿Cuánto puede durar un video para TikTok?', { tool: 'reglas_de_video', has: /segundos/ }],
    ['¿Cuánto pesa máximo un video?', { tool: 'reglas_de_video' }],
    ['¿Qué tomas hago en un acto?', { has: /Storyboard/ }],
    ['¿Dónde veo mis eventos?', { go: '/agenda' }],
    ['¿Cómo marco el evento como realizado?', { has: /realizado/ }],
    // D-89: «Un archivo subido no se mueve ni se reemplaza…».
    ['¿Qué hago si subí un archivo equivocado?', { has: /(?:no|ni) se reemplaza/ }],
    ['¿En qué casilla va el dron?', { has: /casilla/ }],
    ['¿Puedo ver las piezas?', { has: /no ves piezas|los demás roles no/i }],
    ['¿Cómo activo los avisos?', { has: /Mi perfil/ }],
    // The agenda, however it is said: a step of one's own at an event, a distinctive word of its title, a
    // place by its name, the boss coming, a when no time word knows.
    ['¿Cuándo grabo la cancha?', A],
    ['¿A qué hora es lo de la escuela?', A],
    ['a que hora salimos manana', A],
    ['cuanto falta pa la cancha', A],
    ['¿hay barro en Nuevo Amanecer?', A],
    ['el gobernador viene a la cancha, ¿qué llevo?', A],
    ['la cancha es en semana santa, ¿qué llevo?', A],
    // Round 6: a diminutive of its word; a word of a question that is also in a data ficha.
    ['la canchita es en semana santa, ¿qué llevo?', A],
    ['como llego a alto verde', A],
    ['como instalo la app', { has: /pantalla de inicio/ }],
    ['cuanto puede pesar un video', { tool: 'reglas_de_video' }],
    ['que hago si se cae el internet subiendo', { has: /sigue sola/ }],
    // …and a when or a where about something that is also on the agenda (not the sessions ficha, not the bell).
    ['¿A qué hora es la sesión?', A],
    ['¿Dónde es la sesión de fotos?', A],
    ['¿Cuándo es la campaña?', A],
    // Round 7: other forms of its word; what to bring is in no ficha («Ningún aviso lleva…» is not an
    // answer), so next to an event it is the agenda's answer, and in general 360 is not sure.
    ['la canchitica es en semana santa, ¿qué llevo?', A],
    ['el canchón es en semana santa, ¿qué llevo?', A],
    ['el techado es en semana santa, que llevo', A],
    ['¿qué llevo a la cancha?', A],
    ['¿dónde queda mi sesión de fotos?', A],
    ['¿qué tengo que llevar a un acto?', { unsure: true }],
    // R3: nor «tarea».
    ['¿Cómo marco una tarea como hecha?', { has: /realizado/ }],
  ],
  camera2: [
    ['el puentesito es en semana santa, ¿qué llevo?', A],
    ['el puentesito arranca ahorita, que plano hago', A],
    ['que tengo que llevar al puente', { unsure: true }],
  ],
  social2: [
    // About an event, a loose ficha never answers it (it used to get the list of categories).
    ['propuse algo para el 15 en el liceo, ¿ya lo vieron?', A],
    // The event's name is not the topic: the copy is (and nothing of the event in the answer).
    ['las viviendas son el día de la madre, ¿qué copy les hago?', { has: /en «Copies»/ }],
    ['como hago un copy para la jornada de salud', { has: /en «Copies»/ }],
    ['la escuelitica es el día de la madre, ¿qué copy hago?', { has: /en «Copies»/ }],
    // Round 7: «es» before something that is not a deadline asks for the agenda.
    ['¿a qué hora es la invitación del alcalde?', A],
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

describe('preguntas de todos los días, rol por rol (cerebro de demostración)', () => {
  it('al menos 15 por rol', () => {
    for (const role of ['admin', 'boss', 'dispatch', 'politics', 'ivt', 'social', 'camera'] as DemoUserKey[]) expect(TABLE[role]!.length, role).toBeGreaterThanOrEqual(15);
  });

  for (const [role, rows] of Object.entries(TABLE) as [DemoUserKey, [string, Expect][]][]) {
    it(`${role}: cada pregunta tiene su herramienta, su pantalla o su respuesta`, async () => {
      for (const [q, e] of rows) {
        const r = await handleTurn(sessionOf(role), { question: q }, { chain: [] });
        const who = `${role}: ${q} → ${r.answer}`;
        expect(r.model, who).toBe('local');
        expect(r.degraded, who).toBe(false);
        const tools = r.did.map((d) => d.tool);
        for (const s of secrets) expect(r.answer, who).not.toContain(s);
        // The best hours carry times; the video rules, ratios like 9:16.
        if (!tools.some((t) => t === 'mejores_horas' || t === 'reglas_de_video')) expect(r.answer, who).not.toMatch(/\b\d{1,2}:\d{2}\b|\b\d{1,2}\s*[ap]\.?\s?m\b/i);
        if (e.agenda) {
          // The refusal and nothing else: no ficha, no tool but the event lookup.
          expect(r.answer, who).toMatch(REFUSAL);
          expect(tools.filter((t) => t !== 'buscar_evento'), who).toEqual([]);
          continue;
        }
        expect(r.answer, who).not.toMatch(REFUSAL);
        // Administración is never offered to tell administración (D-89): its own «no estoy seguro».
        const unsure = role === 'admin' ? NOT_SURE_ADMIN : NOT_SURE;
        if (e.unsure) expect(r.answer, who).toBe(unsure);
        else expect(r.answer, who).not.toBe(unsure);
        if (e.tool) expect(tools, who).toContain(e.tool);
        if (e.notTool) expect(tools, who).not.toContain(e.notTool);
        if (e.go) expect(r.goTo?.href, who).toBe(e.go);
        if (e.has) expect(r.answer, who).toMatch(e.has);
      }
    });
  }

  it('«no estoy seguro» ofrece avisar a administración, y un «sí» avisa de verdad', async () => {
    const first = await handleTurn(sessionOf('social2'), { question: 'como cambio el logo de la app' }, { chain: [] });
    expect(first.answer).toBe(NOT_SURE);
    const yes = await handleTurn(sessionOf('social2'), { question: 'sí, porfa', conversationId: first.conversationId }, { chain: [] });
    expect(yes.did).toEqual([{ tool: 'avisar_al_equipo' }]);
  });
});
