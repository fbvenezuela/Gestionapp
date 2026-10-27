import { DateTime } from 'luxon';
import type { Sql } from './core';
import { tweetLength } from '../domain/tweets';

// INVENTED demonstration data. No real people, phones, addresses or cases.
// Emails use the reserved `.test` domain, so nothing can ever be delivered to them.
// Never run against production.

export const DEMO_USERS = [
  { id: '00000000-0000-4000-8000-000000000001', key: 'admin', email: 'admin@demo.test', name: 'Carla Méndez', roles: ['admin'], label: 'Administración' },
  { id: '00000000-0000-4000-8000-000000000002', key: 'boss', email: 'jefe@demo.test', name: 'Jefe (demo)', roles: ['boss'], label: 'El jefe' },
  { id: '00000000-0000-4000-8000-000000000003', key: 'dispatch', email: 'despacho@demo.test', name: 'Rubén Contreras', roles: ['dispatch'], label: 'Director de despacho' },
  { id: '00000000-0000-4000-8000-000000000004', key: 'social', email: 'redes@demo.test', name: 'Daniela Pernía', roles: ['social'], label: 'Redes' },
  { id: '00000000-0000-4000-8000-000000000005', key: 'social2', email: 'redes2@demo.test', name: 'Yorman Chacón', roles: ['social'], label: 'Redes' },
  { id: '00000000-0000-4000-8000-000000000006', key: 'supervisor', email: 'supervision@demo.test', name: 'Gustavo Ramírez', roles: ['supervisor'], label: 'Supervisión política' },
  { id: '00000000-0000-4000-8000-000000000007', key: 'camera', email: 'grabacion@demo.test', name: 'Kevin Sánchez', roles: ['camera'], label: 'Grabación' },
  { id: '00000000-0000-4000-8000-000000000008', key: 'camera2', email: 'grabacion2@demo.test', name: 'Mariela Ostos', roles: ['camera'], label: 'Grabación' },
  { id: '00000000-0000-4000-8000-000000000009', key: 'secretary', email: 'secretaria@demo.test', name: 'Lucía Duque', roles: ['secretary'], label: 'Secretaría' },
] as const;

export type DemoUserKey = (typeof DEMO_USERS)[number]['key'];

export async function seedDemo(sql: Sql, tz = 'America/Caracas'): Promise<Record<DemoUserKey, string>> {
  const ids = {} as Record<DemoUserKey, string>;
  for (const u of DEMO_USERS) {
    await sql.query(`insert into public.invitations (email, full_name, roles) values ($1, $2, $3::public.app_role[])`, [
      u.email,
      u.name,
      `{${u.roles.join(',')}}`,
    ]);
    // Fixed ids so a demo session stays valid across server instances.
    const r = await sql.one<{ id: string }>(`insert into auth.users (id, email) values ($1, $2) returning id`, [u.id, u.email]);
    ids[u.key] = r!.id;
  }
  await sql.query(`update public.invitations set invited_by = $1`, [ids.admin]);

  const cat = async (name: string) =>
    (await sql.one<{ id: string }>(`select id from public.categories where name = $1 and parent_id is not null limit 1`, [name]))?.id ?? null;

  const today = DateTime.now().setZone(tz).startOf('day');
  const at = (dayOffset: number, hour: number, minute = 0) =>
    today.plus({ days: dayOffset }).set({ hour, minute }).toUTC().toISO();

  type Ev = {
    title: string; place: string; municipality: string; summary: string; cat: string; day: number; hour: number;
    minutes: number; status: string; decision: string; priority: number | null; urgency: number; done?: boolean; camera?: DemoUserKey;
    brief: { work: string; led: string; inCharge: string; achieve: string; facts: string; protocol: string };
    address: string; directions: string; contacts: string;
  };
  const events: Ev[] = [
    {
      title: 'Entrega de la cancha techada de El Mirador', place: 'Cancha comunal El Mirador', municipality: 'Cárdenas',
      summary: 'Inauguración de la cancha techada con la comunidad y los clubes juveniles.', cat: 'Deporte', day: -2, hour: 9, minutes: 120,
      status: 'editing', decision: 'accepted', priority: 8, urgency: 1, done: true, camera: 'camera',
      brief: { work: 'Techado y piso nuevo de la cancha comunal', led: 'Dirección de obras del estado', inCharge: 'Ing. de obra (demo)',
        achieve: 'Espacio techado para 3 clubes juveniles y actividades de la comunidad', facts: 'Superficie: 600 m². Beneficiados: unas 1.200 personas (dato de la ficha demo).', protocol: 'Palabras del jefe al final; corte de cinta con los clubes.' },
      address: 'Calle 3 con carrera 5, sector El Mirador (demo)', directions: 'Entrar por la avenida principal, segunda a la derecha.', contacts: 'Vocera comunal (demo) 0000-0000000',
    },
    {
      title: 'Recorrido por la rehabilitación del puente La Quebrada', place: 'Puente La Quebrada', municipality: 'Junín',
      summary: 'Revisión del avance de los pilotes y conversación con productores de la zona.', cat: 'Vialidad', day: -1, hour: 14, minutes: 90,
      status: 'material', decision: 'accepted', priority: 9, urgency: 1, done: true, camera: 'camera2',
      brief: { work: 'Rehabilitación de las bases del puente', led: 'Vialidad del estado', inCharge: 'Residente de obra (demo)',
        achieve: 'Recuperar el paso de carga pesada', facts: 'Largo del puente: 80 m. Avance: 60 % (dato demo).', protocol: 'Recorrido a pie; declaración breve a medios.' },
      address: 'Vía principal, km 12 (demo)', directions: 'Desde la plaza, tomar la vía hacia el norte 15 minutos.', contacts: 'Residente de obra (demo) 0000-0000001',
    },
    {
      title: 'Jornada de salud en la escuela Los Andes', place: 'Escuela Los Andes', municipality: 'San Cristóbal',
      summary: 'Jornada de vacunación y entrega de lentes a estudiantes.', cat: 'Salud', day: 0, hour: 10, minutes: 120,
      status: 'recording', decision: 'accepted', priority: 7, urgency: 1, camera: 'camera',
      brief: { work: 'Jornada de atención médica escolar', led: 'Secretaría de Salud (demo)', inCharge: 'Coordinadora de la jornada (demo)',
        achieve: 'Atender a estudiantes de primaria', facts: 'Meta: 300 estudiantes atendidos (dato demo).', protocol: 'Saludo a docentes; recorrido por los módulos.' },
      address: 'Av. Principal, escuela Los Andes (demo)', directions: 'Entrada por el portón lateral.', contacts: 'Dirección de la escuela (demo)',
    },
    {
      title: 'Reunión con productores de café de la zona alta', place: 'Casa comunal Alto Verde', municipality: 'Jáuregui',
      summary: 'Mesa de trabajo sobre financiamiento y vialidad agrícola.', cat: 'Café y cacao', day: 1, hour: 8, minutes: 150,
      status: 'storyboard', decision: 'accepted', priority: 6, urgency: 2, camera: 'camera2',
      brief: { work: 'Mesa de trabajo con productores', led: 'Secretaría de Economía (demo)', inCharge: 'Enlace agrícola (demo)',
        achieve: 'Acordar plan de vialidad agrícola', facts: '', protocol: 'Mesa redonda; el jefe cierra con compromisos.' },
      address: 'Casa comunal Alto Verde (demo)', directions: 'Vía de tierra, se recomienda camioneta.', contacts: 'Enlace agrícola (demo)',
    },
    {
      title: 'Entrega de viviendas en el urbanismo Nuevo Amanecer', place: 'Urbanismo Nuevo Amanecer', municipality: 'Torbes',
      summary: 'Entrega de llaves a familias del urbanismo.', cat: 'Vivienda', day: 3, hour: 16, minutes: 120,
      status: 'brief', decision: 'pending', priority: null, urgency: 2,
      brief: { work: 'Entrega de viviendas', led: 'Instituto de vivienda (demo)', inCharge: 'Gerente del urbanismo (demo)',
        achieve: 'Familias con vivienda propia', facts: 'Viviendas a entregar: 40 (dato demo).', protocol: '' },
      address: 'Urbanismo Nuevo Amanecer, etapa 2 (demo)', directions: '', contacts: '',
    },
    {
      title: 'Feria de emprendedores en la plaza central', place: 'Plaza central', municipality: 'Bolívar',
      summary: 'Feria de emprendimiento local con créditos productivos.', cat: 'Comercio y emprendimiento', day: 6, hour: 11, minutes: 180,
      status: 'brief', decision: 'pending', priority: null, urgency: 3,
      brief: { work: '', led: '', inCharge: '', achieve: '', facts: '', protocol: '' },
      address: 'Plaza central (demo)', directions: '', contacts: '',
    },
  ];

  const eventIds: string[] = [];
  for (const ev of events) {
    const e = await sql.one<{ id: string }>(
      `insert into public.events (title, place_name, municipality, summary, category_id, priority, boss_decision, work_status, urgency, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
      [ev.title, ev.place, ev.municipality, ev.summary, await cat(ev.cat), ev.priority, ev.decision, ev.status, ev.urgency, ids.dispatch],
    );
    const id = e!.id;
    eventIds.push(id);
    const start = at(ev.day, ev.hour);
    const end = DateTime.fromISO(start!).plus({ minutes: ev.minutes }).toUTC().toISO();
    await sql.query(
      `insert into public.event_schedule (event_id, starts_at, ends_at, exact_address, directions, site_contacts) values ($1, $2, $3, $4, $5, $6)`,
      [id, start, end, ev.address, ev.directions, ev.contacts],
    );
    await sql.query(
      `insert into public.event_brief (event_id, work_description, led_by, in_charge, achievements, key_facts, protocol, updated_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, ev.brief.work, ev.brief.led, ev.brief.inCharge, ev.brief.achieve, ev.brief.facts, ev.brief.protocol, ids.dispatch],
    );
    if (ev.camera) {
      await sql.query(`insert into public.event_assignments (event_id, user_id, duty) values ($1, $2, 'camera')`, [id, ids[ev.camera]]);
    }
    if (ev.done) {
      await sql.query(`update public.events set done_on = $2 where id = $1`, [id, today.plus({ days: ev.day }).toISODate()]);
    }
  }

  // Storyboards for the first four events.
  const boards: { speech: string; blocks: [string, string, string, string, string, string][] }[] = [
    {
      speech: '¡Saludos, Táchira! Hoy entregamos esta cancha techada a la comunidad de El Mirador. Son 600 metros cuadrados para que los muchachos entrenen con lluvia o con sol.',
      blocks: [
        ['Plano general', 'Dron desde el norte', 'Saludo y contexto de la obra', 'Cancha llena, niños jugando', 'Superficie: 600 m²', 'Ficha técnica'],
        ['Plano medio', 'Frontal, a la altura de los ojos', 'Para qué sirve la cancha', 'Clubes entrenando', 'Unas 1.200 personas beneficiadas', 'Ficha técnica'],
        ['Primer plano', 'Lateral', 'Cierre: Seguimos trabajando', 'Corte de cinta', '', ''],
      ],
    },
    {
      speech: 'Estamos en el puente La Quebrada revisando el avance. Ya va por el 60 por ciento y pronto vuelve a pasar la carga pesada.',
      blocks: [
        ['Plano general', 'Dron siguiendo el río', 'Dónde estamos y por qué importa', 'Camiones esperando', 'Largo: 80 m', 'Ficha técnica'],
        ['Plano medio', 'Con los obreros detrás', 'Avance de la obra', 'Pilotes, maquinaria', 'Avance: 60 %', 'Residente de obra'],
      ],
    },
    {
      speech: 'Hoy estamos en la escuela Los Andes con la jornada de salud. La meta es atender a 300 estudiantes.',
      blocks: [['Plano medio', 'Frontal', 'Saludo y objetivo de la jornada', 'Niños en la fila de vacunación', 'Meta: 300 estudiantes', 'Secretaría de Salud']],
    },
    { speech: '', blocks: [['Plano general', 'Desde la entrada', 'Contexto de la mesa de trabajo', 'Productores conversando', '', '']] },
  ];
  for (const [i, b] of boards.entries()) {
    const sb = await sql.one<{ id: string }>(
      `insert into public.storyboards (event_id, speech, updated_by) values ($1, $2, $3) returning id`,
      [eventIds[i], b.speech, ids.social],
    );
    for (const [j, blk] of b.blocks.entries()) {
      await sql.query(
        `insert into public.storyboard_blocks (storyboard_id, position, shot, angle, boss_line, broll, fact, fact_source) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [sb!.id, j, ...blk],
      );
    }
  }

  // Material (demo rows, no real files behind them). An explicit null is kept (an image has no
  // duration, fps or codecs); only a missing key takes the video default.
  // Paths and links are numbered, not random: every demo server must seed the same rows.
  let mediaN = 0;
  const media = async (eventId: string | null, kind: string, label: string, by: string, extra: Partial<Record<string, unknown>> = {}) => {
    const pick = (key: string, fallback: unknown) => (key in extra ? extra[key] : fallback);
    const mime = pick('mime', 'video/mp4');
    const path = `${eventId ?? kind}/demo-${++mediaN}${mime === 'image/jpeg' ? '.jpg' : '.mp4'}`;
    const r = await sql.one<{ id: string }>(
      `insert into public.media_assets (event_id, kind, storage_path, label, mime, size_bytes, duration_s, width, height, fps, video_codec, audio_codec, status, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'ready', $13) returning id`,
      [eventId, kind, path, label, mime, pick('size', 250_000_000), pick('duration', 95), pick('width', 1080),
        pick('height', 1920), pick('fps', 30), pick('vcodec', 'avc'), pick('acodec', 'aac'), by],
    );
    return r!.id;
  };
  await media(eventIds[0], 'boss', 'Jefe hablando 1', ids.camera);
  await media(eventIds[0], 'drone', 'Dron 1', ids.camera, { duration: 40 });
  await media(eventIds[0], 'broll', 'Apoyo 1', ids.camera, { duration: 60 });
  await media(eventIds[1], 'boss', 'Jefe hablando 1', ids.camera2);
  await media(eventIds[1], 'drone', 'Dron 1', ids.camera2, { duration: 35 });
  const final1 = await media(eventIds[0], 'final', 'Video final v1', ids.social, { duration: 58 });
  const cover1 = await media(eventIds[0], 'cover', 'Portada v1', ids.social, { mime: 'image/jpeg', size: 300_000, duration: null, fps: null, vcodec: null, acodec: null, width: 1080, height: 1920 });
  const final2 = await media(eventIds[1], 'final', 'Video final v1', ids.social, { duration: 75 });

  // Pieces: one approved (with publications + metrics), one waiting for approval, one draft.
  const piece = async (eventId: string, title: string, catName: string, mediaId: string | null, coverId: string | null) => {
    const p = await sql.one<{ id: string }>(
      `insert into public.pieces (event_id, kind, title, category_id, status, current_version, created_by) values ($1, 'video', $2, $3, 'draft', $4, $5) returning id`,
      [eventId, title, await cat(catName), mediaId ? 1 : 0, ids.social],
    );
    if (mediaId) {
      await sql.query(`insert into public.piece_versions (piece_id, version, media_asset_id, cover_asset_id, created_by) values ($1, 1, $2, $3, $4)`, [
        p!.id, mediaId, coverId, ids.social,
      ]);
    }
    return p!.id;
  };
  const p1 = await piece(eventIds[0], 'Cancha techada de El Mirador', 'Deporte', final1, cover1);
  const p2 = await piece(eventIds[1], 'Avance del puente La Quebrada', 'Vialidad', final2, null);
  await piece(eventIds[2], 'Jornada de salud escolar', 'Salud', null, null);

  const fab = await sql.one<{ id: string }>(`select id from public.copy_formulas where code = 'FAB'`);
  const copiesP1: [string, string][] = [
    ['long', '¡Saludos, Táchira! 👋 Entregamos la cancha techada de El Mirador: 600 m² con techo y piso nuevo. Ahora los clubes juveniles entrenan con lluvia o con sol, y la comunidad tiene un espacio para sus actividades. Unas 1.200 personas se benefician. 💛 Por amor al Táchira.'],
    ['medium', 'Entregamos la cancha techada de El Mirador 🏀 600 m² para que los clubes juveniles entrenen con lluvia o con sol. Unas 1.200 personas se benefician. Seguimos trabajando. ¿Juegas aquí? Cuéntame 👇'],
    ['short', '🏀 Cancha techada de El Mirador: 600 m² para los clubes juveniles y la comunidad. Unas 1.200 personas beneficiadas. Seguimos trabajando 👇 #Tachira #FreddyBernal'],
  ];
  for (const [g, body] of copiesP1) {
    await sql.query(`insert into public.copies (piece_id, formula_id, length_group, body, char_count, generated_by, updated_by) values ($1, $2, $3, $4, $5, 'template', $6)`, [
      p1, fab!.id, g, body, [...body].length, ids.social,
    ]);
  }
  // p2 goes to review like any piece: with its three copies (sendToReview refuses it without them).
  const cifra = await sql.one<{ id: string }>(`select id from public.copy_formulas where code = 'CIFRA'`);
  for (const [g, body] of [
    ['long', '¡Saludos, Táchira! 👋 Seguimos con la rehabilitación del puente La Quebrada: el avance ya llega al 60 %. Cuando terminemos vuelve a pasar la carga pesada y los productores sacan su cosecha sin dar la vuelta larga. 💛 Por amor al Táchira.'],
    ['medium', 'El puente La Quebrada ya va por el 60 % 🚧 Pronto vuelve a pasar la carga pesada y la cosecha sale sin dar la vuelta larga. Seguimos trabajando. ¿Pasas por aquí? Cuéntame 👇'],
    ['short', '🚧 Puente La Quebrada: ya va por el 60 %. Pronto vuelve a pasar la carga pesada. Seguimos trabajando 👇 #Tachira'],
  ] as const) {
    await sql.query(`insert into public.copies (piece_id, formula_id, length_group, body, char_count, generated_by, updated_by) values ($1, $2, $3, $4, $5, 'template', $6)`, [
      p2, cifra?.id ?? fab!.id, g, body, [...body].length, ids.social,
    ]);
  }
  await sql.query(`update public.pieces set status = 'in_review' where id in ($1, $2)`, [p1, p2]);
  await sql.query(`update public.pieces set sent_to_review_at = now() - interval '20 minutes' where id = $1`, [p2]);

  // A sensitive piece (rojo): only the boss approves it.
  const p4 = (await sql.one<{ id: string }>(
    `insert into public.pieces (kind, title, category_id, status, current_version, review_level, created_by) values ('video', 'Aclaratoria sobre el servicio de agua (demo)', $1, 'draft', 1, 'rojo', $2) returning id`,
    [await cat('Agua potable'), ids.social],
  ))!.id;
  await sql.query(`insert into public.piece_versions (piece_id, version, media_asset_id, created_by) values ($1, 1, $2, $3)`, [p4, final2, ids.social]);
  for (const [g, body] of [
    ['long', '¡Saludos, Táchira! 👋 Les explico qué pasa con el servicio de agua en la zona de prueba y qué estamos haciendo. 💛 Por amor al Táchira.'],
    ['medium', 'Qué pasa con el servicio de agua en la zona de prueba y qué estamos haciendo. Seguimos trabajando.'],
    ['short', 'Qué pasa con el agua en la zona de prueba y qué estamos haciendo. #Tachira #FreddyBernal'],
  ] as const) {
    await sql.query(`insert into public.copies (piece_id, formula_id, length_group, body, char_count, generated_by, updated_by) values ($1, $2, $3, $4, $5, 'manual', $6)`, [
      p4, fab!.id, g, body, [...body].length, ids.social,
    ]);
  }
  await sql.query(`update public.pieces set status = 'in_review' where id = $1`, [p4]);
  await sql.query(`update public.pieces set sent_to_review_at = now() - interval '12 minutes' where id = $1`, [p4]);

  // Supervisor approves p1 through the only allowed path.
  await sql.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ids.supervisor, aal: 'aal2', role: 'authenticated' })]);
  await sql.query(`select public.review_piece($1, 'approved', 'Bien. Aprobado.')`, [p1]);
  await sql.query(`select set_config('request.jwt.claims', '', true)`);

  // Publications of p1 at different hours, with metrics, so "¿A qué hora nos va mejor?" has data.
  const pubs: [string, string, number, number, number, number][] = [
    ['instagram', 'reel', -2, 8, 5200, 410],
    ['tiktok', 'video', -2, 12, 8900, 620],
    ['facebook', 'reel', -2, 19, 2100, 150],
    ['instagram', 'reel', -1, 20, 7400, 580],
    ['x', 'post', -1, 7, 900, 45],
  ];
  let firstIg: string | null = null;
  for (const [network, format, day, hour, views, likes] of pubs) {
    const when = at(day, hour, 15);
    const r: { id: string } | null = await sql.one<{ id: string }>(
      `insert into public.publications (piece_id, network, format, copy_body, collaborators, scheduled_at, published_at, url, status, mode, republish_of, created_by)
       values ($1, $2, $3, $4, $5, $6, $6, $7, 'published', 'manual', $8, $9) returning id`,
      [p1, network, format, copiesP1[network === 'x' ? 2 : 0][1], ['@cuenta_aliada_demo'], when,
        `https://example.com/demo/${network}/${format}-${day}-${hour}`, network === 'instagram' && firstIg ? firstIg : null, ids.social],
    );
    if (network === 'instagram' && !firstIg) firstIg = r!.id;
    await sql.query(
      `insert into public.publication_metrics (publication_id, views, reach, likes, comments, shares, saves, source, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, 'manual', $8)`,
      [r!.id, views, Math.round(views * 0.8), likes, Math.round(likes / 8), Math.round(likes / 10), Math.round(likes / 12), ids.social],
    );
  }

  // Something the boss posted himself, recorded afterwards by the team (D-23).
  const sp = await sql.one<{ id: string }>(
    `insert into public.publications (origin, title, network, format, status, mode, url, published_at, created_by)
     values ('boss_spontaneous', 'Video del jefe recorriendo una vía (demo)', 'tiktok', 'post', 'published', 'manual', $1, $2, $3) returning id`,
    ['https://example.com/demo/tiktok/video-del-jefe', at(-1, 22, 40), ids.social],
  );
  await sql.query(
    `insert into public.publication_metrics (publication_id, views, likes, comments, shares, saves, source, created_by) values ($1, 12400, 980, 85, 140, 60, 'manual', $2)`,
    [sp!.id, ids.social],
  );

  // A weekly tweets batch: some approved and scheduled, some draft.
  const batch = await sql.one<{ id: string }>(
    `insert into public.tweet_batches (title, source_name, week_start, created_by) values ('Semana de prueba', 'tweets-semana-demo.docx', $1, $2) returning id`,
    [today.startOf('week').toISODate(), ids.social],
  );
  const tweetTexts = [
    'Esta semana seguimos con la rehabilitación del puente La Quebrada. El avance ya llega al 60 %. Seguimos trabajando.',
    'Entregamos la cancha techada de El Mirador: un espacio para que los muchachos entrenen con lluvia o con sol.',
    'Jornada de salud en la escuela Los Andes: la meta es atender a 300 estudiantes.',
    'Nos reunimos con productores de café de la zona alta para acordar el plan de vialidad agrícola.',
    'Cada obra que entregamos es un compromiso cumplido con la gente. Por amor al Táchira.',
    'El Táchira produce, el Táchira trabaja. Esta semana, feria de emprendedores en la plaza central.',
  ];
  for (const [i, body] of tweetTexts.entries()) {
    const len = tweetLength(body);
    const approved = i < 3;
    const scheduledAt = at(Math.floor(i / 2), i % 2 === 0 ? 8 : 12, 7 + i * 6);
    await sql.query(
      `insert into public.tweets (batch_id, position, body, weighted_length, category_id, scheduled_at, status) values ($1, $2, $3, $4, $5, $6, 'draft')`,
      [batch!.id, i, body, len, await cat(i === 2 ? 'Salud' : 'Gestión de gobierno'), scheduledAt],
    );
    if (approved) {
      await sql.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ids.supervisor, aal: 'aal2', role: 'authenticated' })]);
      await sql.query(`update public.tweets set status = 'approved', approved_by = $2, approved_at = now() where batch_id = $1 and position = $3`, [batch!.id, ids.supervisor, i]);
      await sql.query(`select set_config('request.jwt.claims', '', true)`);
      await sql.query(`update public.tweets set status = 'scheduled' where batch_id = $1 and position = $2`, [batch!.id, i]);
    }
  }

  return ids;
}
