import { getClientConfig } from '../../client-config';
import { parishesSetting } from '../seed-client';
import { buildObraDialog, dialogInput } from '../../domain/obra-dialog';
import type { Sql } from '../core';
import { asPerson, type SeedCtx } from './context';

// INVENTED demonstration fichas (cambios del 27/10/2026, §4.1 and §4.2): three obra fichas of the IVT and seven
// community reports of política. No real people, phones, addresses or cases: places say «(demo)», phones are
// 0000-…. No new events (the RLS tests count them): O-0001 is linked to the existing visit to the puente La
// Quebrada (event #2) and one report to the existing health day (event #3). The history writes itself (triggers),
// with each person as the actor. Parishes come from the client config (empty until the official list arrives), so
// this keeps working once the list is loaded and checked.

const PARISHES = parishesSetting(getClientConfig().parishes as Record<string, unknown>);
const parishFor = (municipality: string, fallback: string) => PARISHES[municipality]?.[0] ?? fallback;

async function insert(sql: Sql, table: string, row: Record<string, unknown>): Promise<{ id: string; code: string }> {
  const cols = Object.keys(row);
  const vals = cols.map((c, n) => (c === 'marks' ? `$${n + 1}::text::jsonb` : `$${n + 1}`));
  const params = cols.map((c) => (c === 'marks' ? JSON.stringify(row[c]) : row[c]));
  const r = await sql.one<{ id: string; code: string }>(
    `insert into public.${table} (${cols.join(', ')}) values (${vals.join(', ')}) returning id, ${table.endsWith('_private') ? 'null as code' : 'code'}`,
    params,
  );
  return r!;
}

export async function seedFichas(ctx: SeedCtx): Promise<void> {
  const { sql, ids, today, at, eventIds } = ctx;
  const day = (n: number) => today.plus({ days: n }).toISODate();
  const brand = getClientConfig().brand;

  // ---------------------------------------------------------------------------
  // Obra fichas (the IVT)
  // ---------------------------------------------------------------------------
  // O-0001: the bridge of event #2 (Junín, 80 m, 60 %), ready, then dated by despacho («Ponerle fecha»).
  const o1 = await asPerson(sql, ids.ivt, async () => {
    const f = await insert(sql, 'obra_fichas', {
      name: 'Rehabilitación del puente La Quebrada',
      municipality: 'Junín',
      parish: parishFor('Junín', 'Parroquia centro (demo)'),
      sector: 'Sector La Quebrada (demo)',
      engineer_name: 'Residente de obra (demo)',
      problem: 'Las bases del puente se socavaron con las lluvias y la carga pesada no puede pasar.',
      problem_since: 'hace dos inviernos',
      why_decided: 'Es el paso de los productores de la zona para sacar la cosecha.',
      works: 'Rehabilitación de las bases del puente, con pilotes nuevos. Largo del puente: 80 m.',
      communities: 'los caseríos de la zona alta (demo)',
      people_count: 1200,
      families_count: 300,
      benefits: 'La carga pesada vuelve a pasar y la cosecha sale sin dar la vuelta larga.',
      executor: 'Vialidad del estado (demo)',
      investment: '1.500.000',
      currency: 'VES',
      funding_source: 'Fondo regional (demo)',
      work_state: 'in_progress',
      progress_pct: 60,
      started_on: day(-90),
      due_on: day(60),
      difficulties: 'Las lluvias atrasan el vaciado de concreto.',
      solutions: 'Se trabaja en dos turnos cuando escampa.',
      other_aid: 'Jornada de salud en la escuela del sector (demo).',
      pending_needs: 'Alumbrado en la entrada del puente.',
      next_action: 'Revisar el avance con el residente de obra.',
      follow_up_owner: 'Residente de obra (demo)',
      follow_up_due: day(14),
      stage: 'to_schedule',
      marks: {},
    });
    await insert(sql, 'obra_ficha_private', {
      id: f.id,
      engineer_phone: '0000-0000101',
      reporter_name: 'Vocero comunal (demo)',
      reported_when: 'el mes pasado',
      reported_via: 'Reunión con la comunidad',
      reporter_attends: 'yes',
      representative: '',
      liaison_name: 'Enlace comunitario (demo)',
      liaison_phone: '0000-0000102',
      boss_should_know: 'La comunidad pide alumbrado en la entrada del puente.',
      marks: { representative: 'not_applicable' },
    });
    // «Lo que voy a decir», from the template (only the ficha's own figures).
    const row = await sql.one<Record<string, unknown>>(`select * from public.obra_fichas where id = $1`, [f.id]);
    const dialog = buildObraDialog(dialogInput(row!), { greeting: brand.greeting, closings: brand.closings });
    await sql.query(`update public.obra_fichas set fab_dialog = $2, fab_generated_by = 'template' where id = $1`, [f.id, dialog.text]);
    return f;
  });
  // Despacho put the date: the stage changes only through a trusted path (as schedule_ficha will do).
  await asPerson(sql, ids.dispatch, async () => {
    await sql.query(`select set_config('app.trusted_update', 'on', true)`);
    try {
      await sql.query(`update public.obra_fichas set stage = 'scheduled' where id = $1`, [o1.id]);
    } finally {
      await sql.query(`select set_config('app.trusted_update', '', true)`);
    }
  });
  await sql.query(`update public.events set obra_ficha_id = $1 where id = $2`, [o1.id, eventIds[1]]);

  // O-0002: ready, waiting for a date; three answers «Por confirmar» and one «No aplica».
  await asPerson(sql, ids.ivt, async () => {
    const f = await insert(sql, 'obra_fichas', {
      name: 'Asfaltado de la vía del sector Las Palmas (demo)',
      municipality: 'Cárdenas',
      parish: parishFor('Cárdenas', 'Parroquia norte (demo)'),
      sector: 'Sector Las Palmas (demo)',
      engineer_name: 'Ingeniera de vialidad (demo)',
      problem: 'La vía tiene huecos grandes y en lluvia los carros no suben.',
      problem_since: 'hace tres años',
      why_decided: 'La pidieron los voceros en la asamblea del sector.',
      works: 'Bacheo y asfaltado de la vía principal del sector, con cunetas a los dos lados.',
      communities: 'el sector Las Palmas y la urbanización vecina (demo)',
      people_count: 850,
      families_count: 210,
      benefits: 'Llegan el transporte público y el camión del gas.',
      executor: 'Empresa contratista (demo)',
      investment: '',
      currency: 'VES',
      funding_source: 'Presupuesto de la gobernación (demo)',
      work_state: 'not_started',
      progress_pct: null,
      started_on: day(-10),
      due_on: null,
      difficulties: 'Falta la mezcla asfáltica de la planta.',
      solutions: 'Se pidió la mezcla a otra planta.',
      other_aid: '',
      pending_needs: 'Reductores de velocidad frente a la escuela.',
      next_action: 'Confirmar la fecha de la mezcla.',
      follow_up_owner: 'Ingeniera de vialidad (demo)',
      follow_up_due: day(10),
      stage: 'to_schedule',
      marks: { investment: 'to_confirm', progress_pct: 'to_confirm', due_on: 'to_confirm', other_aid: 'not_applicable' },
    });
    await insert(sql, 'obra_ficha_private', {
      id: f.id,
      engineer_phone: '0000-0000111',
      reporter_name: 'Vocera del consejo comunal (demo)',
      reported_when: 'en la asamblea del sector',
      reported_via: 'Asamblea',
      reporter_attends: 'to_confirm',
      representative: 'El vocero suplente (demo)',
      liaison_name: 'Enlace comunitario (demo)',
      liaison_phone: '0000-0000112',
      boss_should_know: 'Los voceros quieren saber cuándo llega la mezcla.',
      marks: {},
    });
  });

  // O-0003: a draft, half filled (nobody gets a notice).
  await asPerson(sql, ids.ivt, () =>
    insert(sql, 'obra_fichas', {
      name: 'Muro de contención en la quebrada El Rincón (demo)',
      municipality: 'Torbes',
      parish: parishFor('Torbes', ''),
      sector: 'Sector El Rincón (demo)',
      problem: 'La quebrada se lleva la orilla y hay casas en riesgo.',
      works: 'Muro de gaviones a lo largo de la orilla.',
      stage: 'draft',
      marks: {},
    }),
  );

  // ---------------------------------------------------------------------------
  // Community reports (política)
  // ---------------------------------------------------------------------------
  type Rep = { row: Record<string, unknown>; priv: Record<string, unknown>; then?: { status: string; note: string }[]; note?: string; linkEvent?: string };
  const reports: Rep[] = [
    {
      // Goes to the boss's agenda: waiting for a date.
      row: {
        title: 'Asamblea con los voceros del sector La Ermita (demo)', type: 'event', wants_agenda: true, municipality: 'Torbes',
        parish: parishFor('Torbes', 'Parroquia centro (demo)'), community: 'Sector La Ermita (demo)', reported_at: at(-2, 9),
        description: 'Los voceros piden reunirse con el jefe para hablar del agua y de la vía.', why_matters: 'Es el primer encuentro con el sector este año.',
        in_charge: 'Coordinación de política (demo)', institution: 'Consejo comunal La Ermita (demo)', collaborators: 'Hidrológica y vialidad (demo)',
        people_count: 80, sectors: 'La Ermita y El Cerrito (demo)', figures_kind: 'estimated', status: 'planned', priority: 'medium',
        priority_reason: 'Lo pidieron varias veces.', follow_up_owner: 'Coordinación de política (demo)', follow_up_due: day(7), marks: {},
      },
      priv: { reporter_name: 'Vocera del consejo comunal (demo)', reporter_role: 'Vocera principal', reporter_phone: '0000-0000201', address: 'Casa comunal La Ermita (demo)', reference: 'Frente a la cancha (demo)', activity_at: at(5, 10), marks: {} },
    },
    {
      // Went to the agenda and became the health day (event #3).
      row: {
        title: 'Jornada de salud en la escuela Los Andes (demo)', type: 'outreach', wants_agenda: true, municipality: 'San Cristóbal',
        parish: parishFor('San Cristóbal', 'Parroquia sur (demo)'), community: 'Escuela Los Andes (demo)', reported_at: at(-6, 11),
        description: 'Vacunación y entrega de lentes a los estudiantes de primaria.', why_matters: 'Muchos niños no tienen control de la vista.',
        in_charge: 'Coordinadora de la jornada (demo)', institution: 'Secretaría de salud (demo)', collaborators: 'Dirección de la escuela (demo)',
        people_count: 300, families_count: 220, sectors: 'Los Andes (demo)', figures_kind: 'estimated', status: 'planned', priority: 'high',
        priority_reason: 'Antes del inicio de clases.', follow_up_owner: 'Coordinadora de la jornada (demo)', follow_up_due: day(2), marks: {},
      },
      priv: { reporter_name: 'Directora de la escuela (demo)', reporter_role: 'Directora', reporter_phone: '0000-0000202', address: 'Escuela Los Andes (demo)', reference: 'Portón lateral (demo)', marks: { activity_at: 'to_confirm' } },
      then: [{ status: 'in_progress', note: 'El jefe la aceptó; ya está en la agenda.' }],
      linkEvent: eventIds[2],
    },
    {
      // Overdue: its follow-up date passed and it is still pending.
      row: {
        title: 'Bote de aguas negras en la calle principal (demo)', type: 'incident', wants_agenda: false, municipality: 'Junín',
        parish: parishFor('Junín', 'Parroquia centro (demo)'), community: 'Calle principal del sector El Carmen (demo)', reported_at: at(-12, 8),
        description: 'Hay un bote de aguas negras frente a las casas desde hace semanas.', why_matters: 'Es un riesgo para la salud de los niños.',
        in_charge: 'Coordinación de política (demo)', institution: 'Hidrológica (demo)', collaborators: '',
        people_count: 120, families_count: 30, sectors: 'El Carmen (demo)', figures_kind: 'estimated', status: 'planned', priority: 'high',
        priority_reason: 'Riesgo para la salud.', follow_up_owner: 'Hidrológica (demo)', follow_up_due: day(-5), marks: { collaborators: 'not_applicable' },
      },
      priv: { reporter_name: 'Vecino del sector (demo)', reporter_role: 'Vecino', reporter_phone: '0000-0000203', address: 'Calle principal, casa 4 (demo)', reference: 'Al lado de la bodega (demo)', activity_at: at(-12, 7), marks: {} },
      then: [{ status: 'pending', note: 'Se reportó a la hidrológica; esperan la cuadrilla.' }],
      note: 'Volver a llamar a la hidrológica.',
    },
    {
      // Finished, with confirmed figures.
      row: {
        title: 'Entrega de bombonas de gas en el sector El Mirador (demo)', type: 'delivery', wants_agenda: false, municipality: 'Cárdenas',
        parish: parishFor('Cárdenas', 'Parroquia norte (demo)'), community: 'Sector El Mirador (demo)', reported_at: at(-9, 15),
        description: 'Entrega de bombonas de gas a las familias del sector.', why_matters: 'El gas no llegaba desde hace un mes.',
        in_charge: 'Coordinación de política (demo)', institution: 'Empresa de gas (demo)', collaborators: 'Consejo comunal El Mirador (demo)',
        people_count: 340, families_count: 85, sectors: 'El Mirador (demo)', figures_kind: 'confirmed', status: 'in_progress', priority: 'medium',
        priority_reason: '', follow_up_owner: 'Coordinación de política (demo)', follow_up_due: day(-2), marks: { priority_reason: 'not_applicable' },
      },
      priv: { reporter_name: 'Vocero del consejo comunal (demo)', reporter_role: 'Vocero', reporter_phone: '0000-0000204', address: 'Cancha del sector (demo)', reference: '', activity_at: at(-8, 9), marks: { reference: 'not_applicable' } },
      then: [{ status: 'finished', note: 'Se entregaron las 85 bombonas.' }],
    },
    {
      // Suspended.
      row: {
        title: 'Operativo de poda en la avenida principal (demo)', type: 'repair', wants_agenda: false, municipality: 'Jáuregui',
        parish: parishFor('Jáuregui', 'Parroquia centro (demo)'), community: 'Avenida principal (demo)', reported_at: at(-4, 10),
        description: 'Poda de los árboles que tapan el alumbrado.', why_matters: 'La avenida queda a oscuras de noche.',
        in_charge: 'Servicios públicos (demo)', institution: 'Alcaldía (demo)', collaborators: '', sectors: 'Centro (demo)',
        status: 'planned', priority: 'low', follow_up_owner: 'Servicios públicos (demo)', follow_up_due: day(-1), marks: { collaborators: 'not_applicable', people_count: 'to_confirm' },
      },
      priv: { reporter_name: 'Comerciante de la avenida (demo)', reporter_role: '', reporter_phone: '0000-0000205', address: '', reference: '', marks: { reporter_role: 'not_applicable' } },
      then: [{ status: 'suspended', note: 'Se suspendió por las lluvias.' }],
    },
    {
      // A request, pending, not overdue.
      row: {
        title: 'Solicitud de alumbrado en la cancha del sector Pirineos (demo)', type: 'request', wants_agenda: false, municipality: 'San Cristóbal',
        parish: parishFor('San Cristóbal', 'Parroquia sur (demo)'), community: 'Sector Pirineos (demo)', reported_at: at(-3, 17),
        description: 'Piden lámparas para la cancha; los muchachos juegan a oscuras.', why_matters: 'La cancha es el único espacio deportivo del sector.',
        in_charge: 'Coordinación de política (demo)', institution: 'Empresa eléctrica (demo)', collaborators: '', people_count: 200, sectors: 'Pirineos (demo)',
        figures_kind: 'estimated', status: 'pending', priority: 'low', priority_reason: 'Puede esperar a la próxima compra de lámparas.',
        follow_up_owner: 'Coordinación de política (demo)', follow_up_due: day(10), marks: {},
      },
      priv: { reporter_name: 'Entrenador del club (demo)', reporter_role: 'Entrenador', reporter_phone: '0000-0000206', address: 'Cancha del sector Pirineos (demo)', reference: '', marks: {} },
    },
    {
      // A benefit in progress.
      row: {
        title: 'Entrega de kits escolares en la escuela del sector (demo)', type: 'benefit', wants_agenda: false, municipality: 'Torbes',
        parish: parishFor('Torbes', 'Parroquia centro (demo)'), community: 'Escuela del sector El Valle (demo)', reported_at: at(-1, 14),
        description: 'Entrega de kits escolares a los estudiantes de primaria.', why_matters: 'Muchas familias no pudieron comprar los útiles.',
        in_charge: 'Coordinación de política (demo)', institution: 'Secretaría de educación (demo)', collaborators: 'Dirección de la escuela (demo)',
        people_count: 150, families_count: 120, sectors: 'El Valle (demo)', figures_kind: 'estimated', status: 'in_progress', priority: 'medium',
        priority_reason: 'Antes del inicio de clases.', follow_up_owner: 'Coordinación de política (demo)', follow_up_due: day(3), marks: {},
      },
      priv: { reporter_name: 'Directora de la escuela (demo)', reporter_role: 'Directora', reporter_phone: '0000-0000207', address: 'Escuela El Valle (demo)', reference: '', activity_at: at(1, 9), marks: {} },
    },
  ];

  for (const r of reports) {
    const rep = await asPerson(sql, ids.politics, async () => {
      const created = await insert(sql, 'community_reports', r.row);
      await insert(sql, 'community_report_private', { id: created.id, ...r.priv });
      for (const step of r.then ?? []) {
        await sql.query(`select set_config('app.history_note', $1, true)`, [step.note]);
        await sql.query(`update public.community_reports set status = $2 where id = $1`, [created.id, step.status]);
      }
      if (r.note) await sql.query(`insert into public.ficha_updates (community_report_id, kind, note) values ($1, 'note', $2)`, [created.id, r.note]);
      return created;
    });
    if (r.linkEvent) await sql.query(`update public.events set community_report_id = $1 where id = $2`, [rep.id, r.linkEvent]);
  }
}
