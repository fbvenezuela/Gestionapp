import { CITIZEN_STATE_LABEL, type RequestState } from './input';
import { EMERGENCY_NOTICE } from './notices';

// The words of the emails a citizen receives (copy audit K15 and the status emails of design §5), as «usted»: what
// happened and where to read it. Never the secret (nobody has it), never what the team wrote, never the kind of request:
// an inbox or a phone's lock screen is seen by others, and a «denuncia» there could put the person at risk (the security
// review of 06/11); only someone who supported a report reads the word «reporte». The receipt's confirmation is written
// by participation-core.ts; the status emails by src/lib/actions/attention-email.ts through statusEmail() of
// src/lib/domain/attention.ts, which can take these words as they are (same signature). Pure.

export type CitizenEmail = { subject: string; title: string; body: string };
export type StatusEmailKind = 'state' | 'reply' | 'info_request' | 'merged';
/** Who the email is for: who sent the request, someone who supported it, or the sender of a duplicate merged into it. */
export type StatusEmailRole = 'owner' | 'supporter' | 'duplicate';

/** How to read the case: the same line in every email to a citizen. */
export const HOW_TO_CONSULT =
  'Para ver el detalle, entre a «Consultar mi solicitud» con su código y la clave de su comprobante. Por seguridad, la clave no se envía por correo.';

/** The line under every email to a citizen (the team's emails keep their own, about their profile's notices). */
export const CITIZEN_EMAIL_FOOTER = 'Mensaje automático de Atención ciudadana. Para responder o agregar información, ingrese a «Consultar mi solicitud».';

/** The confirmation right after sending (a request, or a support of an open report): the code, never the secret. */
export function receiptEmail(kind: 'request' | 'support', reference: string): CitizenEmail {
  if (kind === 'support') {
    return {
      subject: `Apoyo registrado ${reference}`,
      title: 'Apoyo registrado',
      body: [`Su apoyo al reporte quedó registrado. Su código para consultarlo es ${reference}.`, HOW_TO_CONSULT, EMERGENCY_NOTICE].join('\n'),
    };
  }
  return {
    subject: `Solicitud recibida ${reference}`,
    title: 'Solicitud recibida',
    body: [`Su solicitud fue recibida con el código ${reference}.`, HOW_TO_CONSULT, EMERGENCY_NOTICE].join('\n'),
  };
}

/** A reply, a request for more information, a merge or a change of state of the person's case. */
export function statusEmail(kind: StatusEmailKind, o: { reference: string; state?: RequestState | null; role?: StatusEmailRole }): CitizenEmail {
  const ref = o.reference;
  const role = o.role ?? 'owner';
  const lines = (...first: string[]) => [...first, HOW_TO_CONSULT, EMERGENCY_NOTICE].join('\n');
  if (kind === 'reply') {
    return { subject: `Respuesta a su solicitud ${ref}`, title: 'Respuesta a su solicitud', body: lines(`Atención ciudadana respondió a su solicitud ${ref}.`) };
  }
  if (kind === 'info_request') {
    return {
      subject: `Se necesita información sobre su solicitud ${ref}`,
      title: 'Se necesita información',
      body: lines(`Para continuar con su solicitud ${ref} se necesita información adicional. En la consulta verá qué hace falta y podrá responder.`),
    };
  }
  if (kind === 'merged') {
    return {
      subject: `Su solicitud ${ref} se tramita junto con otra`,
      title: 'Su solicitud se tramita junto con otra',
      body: lines(`Su solicitud ${ref} se refiere al mismo problema que otra ya en atención y se tramitará junto con ella. Puede seguir consultándola con el mismo código.`),
    };
  }
  const label = o.state ? CITIZEN_STATE_LABEL[o.state] : null;
  const changed = label ? `pasó al estado «${label}»` : 'cambió de estado';
  const lead =
    role === 'supporter'
      ? `El reporte que usted apoyó ${changed}. Su código es ${ref}.`
      : role === 'duplicate'
        ? `Su solicitud ${ref} se tramita junto con otra, que ${changed}.`
        : `Su solicitud ${ref} ${changed}.`;
  const extra =
    role !== 'owner'
      ? null
      : o.state === 'resuelto'
        ? 'Si el problema no se resolvió, indíquelo en la consulta y la solicitud se revisará de nuevo.'
        : o.state === 'requiere_informacion'
          ? 'Se necesita información adicional. En la consulta verá qué hace falta.'
          : null;
  return {
    subject: label ? `Su solicitud ${ref}: ${label}` : `Su solicitud ${ref} cambió de estado`,
    title: 'Cambio de estado de su solicitud',
    body: lines(lead, ...(extra ? [extra] : [])),
  };
}
