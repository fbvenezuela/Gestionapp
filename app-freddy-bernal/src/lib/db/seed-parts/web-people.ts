// The public website and the attention desk in the demo (D-93, design §8): one person per new role, and a responsible
// in each of two areas (AREA_OF). Invented, on the reserved .test domain; fixed ids, like the team's. Seeded by the last
// part of the demo (seed-parts/web.ts), so every row before keeps its demo id; «Entrar como…» lists them after the team.
export const WEB_DEMO_USERS = [
  { id: '00000000-0000-4000-8000-0000000000c1', key: 'webEditor', email: 'web.editora@demo.test', name: 'Editora de la web (demo)', roles: ['writer'], label: 'Editor de la web' },
  { id: '00000000-0000-4000-8000-0000000000c2', key: 'webPublisher', email: 'web.aprobador@demo.test', name: 'Aprobador de la web (demo)', roles: ['web_publisher'], label: 'Aprobador de la web' },
  { id: '00000000-0000-4000-8000-0000000000c3', key: 'attention', email: 'atencion.coordinacion@demo.test', name: 'Coordinación de atención (demo)', roles: ['attention_coordinator'], label: 'Coordinador de atención' },
  { id: '00000000-0000-4000-8000-0000000000c4', key: 'servicesLead', email: 'atencion.servicios@demo.test', name: 'Responsable de servicios públicos (demo)', roles: ['reports_operator'], label: 'Responsable de área · Servicios públicos' },
  { id: '00000000-0000-4000-8000-0000000000c5', key: 'roadsLead', email: 'atencion.vialidad@demo.test', name: 'Responsable de vialidad (demo)', roles: ['reports_operator'], label: 'Responsable de área · Vialidad y transporte' },
  { id: '00000000-0000-4000-8000-0000000000c6', key: 'complaintsDesk', email: 'atencion.denuncias@demo.test', name: 'Operador de denuncias (demo)', roles: ['complaints_operator'], label: 'Operador de denuncias' },
  { id: '00000000-0000-4000-8000-0000000000c7', key: 'auditView', email: 'consulta@demo.test', name: 'Consulta y auditoría (demo)', roles: ['auditor'], label: 'Consulta y auditoría' },
] as const;

export type WebDemoUserKey = (typeof WEB_DEMO_USERS)[number]['key'];

// The two responsibles' areas (config/clients/fb.json «participation.areas»).
export const AREA_OF = { servicesLead: 'servicios-publicos', roadsLead: 'vialidad-transporte' } as const satisfies Partial<Record<WebDemoUserKey, string>>;
