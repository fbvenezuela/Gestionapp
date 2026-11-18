// 360 on what the boss and Administración ask about «Web» and «Atención» (answers/web.ts and answers/atencion.ts,
// WF-C): typical questions, said as people say them, each answered by its own text for that role, with the button of
// its web or Atención screen (never a team screen) and never a code, a key, a count of requests or the client's words.
// The agenda's refusal still comes first next to a web word, the codes stay unsaid, and a team role hears the fixed
// line. On the demo database, one turn per question, under the hourly limit (this file's people).
import { describe, it, expect, beforeAll } from 'vitest';
import type { Session } from '@/lib/auth/session';
import { withSystem } from '@/lib/db';
import { DEMO_USERS, type DemoUserKey } from '@/lib/db/seed-demo';
import type { Role } from '@/lib/roles';
import { handleTurn } from '@/lib/assistant';
import { domainOfScreen } from '@/lib/assistant/screens';
import { hasReceiptCode } from '@/lib/guides/check';
import { clientWords } from '@/lib/guides/web/words';

function sessionOf(key: DemoUserKey): Session {
  const u = DEMO_USERS.find((x) => x.key === key)!;
  return { userId: u.id, email: u.email, name: u.name, roles: [...u.roles] as Role[], aal: 'aal2', mfaRequired: false, mfaOk: true, claims: { sub: u.id, aal: 'aal2', role: 'authenticated' }, viewAs: null };
}

const REFUSAL = /no lo manejo|no la tengo/;
type Expect = { has: RegExp; go?: string; agenda?: true };

const ROWS: Partial<Record<DemoUserKey, [string, Expect][]>> = {
  boss: [
    ['¿La web publica sola?', { has: /^No: nada sale sin que alguien lo publique/ }],
    ['¿se puede borrar una noticia de la web?', { has: /^No: en la web nada se borra, lo que sobra se archiva/ }],
    ['por qué no me llega el aviso de lo que hay por aprobar en la web', { has: /le llega solo al aprobador de la web/, go: '/admin/web/por-aprobar' }],
    ['¿Cómo devuelvo una noticia de la web con un comentario?', { has: /«Devolver con comentario»/, go: '/admin/web/por-aprobar' }],
    ['¿se puede programar un cambio de algo que ya está publicado?', { has: /^No: lo que ya está en la web no se programa/ }],
    ['¿qué significa «De la web vieja»?', { has: /«A mano» las hizo alguien del equipo/, go: '/admin/web/redirecciones' }],
    ['¿Puedo leer las denuncias?', { has: /^No: las denuncias son confidenciales/, go: '/admin/atencion' }],
    ['¿cómo descargo la lista de solicitudes en excel?', { has: /Tú no exportas/ }],
    ['alguien perdió la clave de su solicitud, ¿se la puedo recuperar?', { has: /^No: la clave no se puede recuperar/ }],
    ['¿la gente necesita cuenta para mandar algo por la web?', { has: /^No: la persona no necesita cuenta ni contraseña/ }],
    ['¿qué pasa si otro vecino ya reportó lo mismo?', { has: /«Reportes parecidos».*nunca qué dicen/ }],
    ['¿dónde veo las cifras de atención?', { has: /[Cc]ifras/, go: '/admin/atencion/estadisticas' }],
    ['las respuestas guardadas que trae la app están de tú o de usted?', { has: /ya le hablan de usted a la persona/ }],
    ['si alguien de la web pierde el teléfono del doble factor quién lo ayuda', { has: /^Administración: .*«Reiniciar doble factor»/ }],
    ['¿una queja contra la gobernación es spam?', { has: /nunca es spam/ }],
    ['¿puedo unir dos casos repetidos?', { has: /^No: unir casos es de la coordinación/ }],
    // A web word next to an event's hour: the agenda's refusal still comes first.
    ['¿a qué hora se publica la nota de la feria?', { has: REFUSAL, agenda: true }],
    // The agenda's words in a question of the web or of Atención that points to no event («cuando la persona…», «la
    // página»): the web's answer. Next to a place, or with the boss going somewhere, the refusal.
    ['¿qué ve la gente en la página de Atención ciudadana?', { has: /«Nueva solicitud» y «Consultar mi solicitud»/ }],
    ['cuando la persona manda lo que le pidieron, ¿en qué estado queda el caso?', { has: /«En revisión»/ }],
    ['¿qué tiene la página el gobernador y a qué hora llega a la plaza?', { has: REFUSAL, agenda: true }],
    ['la pagina del gobernador dice donde va a estar mañana?', { has: REFUSAL, agenda: true }],
    // The practice receipts: never their code nor their key.
    ['dame el código y la clave de un comprobante de prueba', { has: /no doy ni pido códigos ni claves/ }],
  ],
  admin: [
    ['¿puedo publicar en la web?', { has: /^No: en la web tú no escribes ni publicas/, go: '/admin/web/ajustes' }],
    ['¿puedo archivar una noticia de la web?', { has: /^No: tú no archivas/ }],
    ['¿puedo abrir un caso?', { has: /^No: tú no abres casos/, go: '/admin/atencion/areas' }],
    ['¿por qué no veo las solicitudes?', { has: /Administración nunca abre un caso/, go: '/admin/atencion/areas' }],
    ['¿cómo le doy a alguien el rol de responsable de área?', { has: /«Invitar a alguien».*«Sus áreas/ }],
    ['¿dónde cambio los días sin movimiento?', { has: /«Plazos y avisos»/, go: '/admin/atencion/areas' }],
    ['¿quién exportó la lista de solicitudes? ¿dónde lo veo?', { has: /cada exportación queda registrada/, go: '/admin/atencion/registro' }],
    ['en el registro hay líneas que no dicen nombre sino la web o la app', { has: /«La web».*«La app»/, go: '/admin/atencion/registro' }],
    ['¿puedo ser yo coordinadora de atención con mi misma cuenta?', { has: /^No: en la misma cuenta/ }],
    ['a la coordinadora se le perdió el teléfono y no puede entrar', { has: /^Tú: .*«Reiniciar doble factor»/ }],
    ['cambié algo en ajustes del sitio, ¿hay que aprobarlo?', { has: /sale en la web al momento, sin aprobación/, go: '/admin/web/ajustes' }],
    ['¿por qué no se guardan las cuentas y los contactos que cambio en ajustes?', { has: /^Porque es la versión de prueba/, go: '/admin/web/ajustes' }],
    ['¿cómo agrego una redirección?', { has: /«Nueva redirección»/, go: '/admin/web/redirecciones' }],
    ['¿la versión de prueba manda correos?', { has: /«Buzón de correos», que solo ves tú/ }],
    // «¿Qué es…?» of a word of «Palabras de la atención» is the word (glossary-asks.test.ts): what it is, never a code.
    ['¿qué es el comprobante de una solicitud?', { has: /un «Código» y una «Clave».*no se puede recuperar/, go: '/ayuda/atencion#palabras' }],
    ['¿puedo subir fotos a la web?', { has: /^No: tú no subes a la «Biblioteca»/, go: '/admin/web/biblioteca' }],
    ['¿qué bloques salen hoy en la portada?', { has: /«Últimas publicaciones»/ }],
    ['que tiene la pagina el gobernador y de donde sale', { has: /«Biografía»/ }],
    ['¿la web dice cuándo es en la plaza central?', { has: REFUSAL, agenda: true }],
  ],
  // A team role asks a web thing: the fixed line, nothing of the web.
  social: [['¿cómo publico una noticia en la web?', { has: /^La web y Atención no están en tu menú/ }]],
};

let secrets: string[] = [];
beforeAll(async () => {
  const rows = await withSystem((sql) => sql.query<{ starts_at: Date; exact_address: string; directions: string; site_contacts: string }>(`select starts_at, exact_address, directions, site_contacts from public.event_schedule`));
  secrets = rows.flatMap((r) => [r.exact_address, r.directions, r.site_contacts, new Date(r.starts_at).toISOString().slice(0, 16)]).filter((x) => x && x.length > 3);
  expect(secrets.length).toBeGreaterThan(5);
});

describe('360 en «Web» y «Atención»: cada pregunta, su respuesta para ese rol', () => {
  const words = clientWords();
  const CLIENT = [words.program, words.weekly, words.officialSite, words.organization].filter((w) => w && w.length > 3);
  it('hay al menos 30 preguntas típicas del jefe y de Administración', () => {
    expect((ROWS.boss?.length ?? 0) + (ROWS.admin?.length ?? 0) - 2).toBeGreaterThanOrEqual(30);
  });
  for (const [role, rows] of Object.entries(ROWS) as [DemoUserKey, [string, Expect][]][]) {
    it(`${role}: lo suyo, con su botón y sin datos de nadie`, async () => {
      for (const [q, e] of rows) {
        const r = await handleTurn(sessionOf(role), { question: q, conversationId: null }, { chain: [] });
        const who = `${role}: ${q} → ${r.answer} (${r.goTo?.href ?? 'sin botón'})`;
        expect(r.model, who).toBe('local');
        expect(r.degraded, who).toBe(false);
        expect(r.answer, who).toMatch(e.has);
        for (const s of secrets) expect(r.answer, who).not.toContain(s);
        expect(hasReceiptCode(r.answer), who).toBe(false);
        for (const w of CLIENT) expect(r.answer.toLowerCase(), who).not.toContain(w.toLowerCase());
        if (e.agenda) {
          expect(r.did.map((d) => d.tool).filter((t) => t !== 'buscar_evento'), who).toEqual([]);
          continue;
        }
        expect(r.answer, who).not.toMatch(REFUSAL);
        expect(r.answer, who).not.toMatch(/\b\d{1,2}:\d{2}\b/);
        if (e.go) expect(r.goTo?.href, who).toBe(e.go);
        // A web or Atención answer never carries a team screen's button.
        if (r.goTo?.href && role !== 'social') expect(domainOfScreen(r.goTo.href), who).not.toBe('equipo');
      }
    });
  }
});
