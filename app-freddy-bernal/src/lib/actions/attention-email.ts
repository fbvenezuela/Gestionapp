import 'server-only';
import { after } from 'next/server';
import { createElement } from 'react';
import { NoticeEmail } from '@emails/templates';
import { withSystem } from '../db';
import type { Sql } from '../db/core';
import { sendEmail } from '../email/send';
import { contactKeyring, openContact } from '../participation/contact-crypto';
import { contactEmail, statusEmail, statusEmailRoles, type RequestState, type StatusEmailKind, type StatusEmailRole } from '../domain/attention';
import { CITIZEN_EMAIL_FOOTER } from '../participation/emails';
import { SITE_NAME, confirmationPlan, lookupUrl } from './participation-core';

// The status emails of the attention desk (design §4, §5): when the team replies to the person, asks them for more
// information or changes the state of their case, and they left an email (and did not choose «Que no me contacten»),
// a short email goes through the outbox like every other one (src/lib/email/send.ts). It says what happened and where
// to read it: never the secret (nobody has it), never what the team wrote, never the kind of request. Gated like the
// receipt's confirmation (confirmationPlan in participation-core.ts): written only when email is configured to deliver
// to that address, or in the demo, where the outbox stands in for the inbox; production with EMAIL_MODE=outbox writes
// nothing, so a citizen's address is never kept in the clear for an email that will not leave.
//
// The contact is read here with withSystem: this is the system sending on the person's behalf, after the team's action
// committed (never inside it), and only to send. A change of state also reaches the people who joined the case
// («¿te sumas?») and the senders of the duplicates merged into it, each with their own code.

export type StatusEmailEvent = { requestId: string; kind: StatusEmailKind; state?: RequestState | null; key: string };

type Recipient = {
  contact_id: string; role: StatusEmailRole; reference: string; name_enc: string | null; email_enc: string | null; phone_enc: string | null;
  preferred_channel: string;
};

/** The contacts a status email of this kind goes to (ciphertext; nothing decrypted here). Never for spam. */
export async function statusEmailRecipients(sql: Sql, requestId: string, kind: StatusEmailKind): Promise<Recipient[]> {
  const roles = statusEmailRoles(kind);
  const parts: string[] = [];
  if (roles.includes('owner')) {
    parts.push(`select c.id as contact_id, 'owner' as role, r.reference, c.name_enc, c.email_enc, c.phone_enc, c.preferred_channel
                  from public.request_contacts c join public.requests r on r.id = c.request_id where r.id = $1 and not r.is_spam`);
  }
  if (roles.includes('supporter')) {
    parts.push(`select c.id, 'supporter', s.reference, c.name_enc, c.email_enc, c.phone_enc, c.preferred_channel
                  from public.request_contacts c join public.request_supports s on s.id = c.support_id
                  join public.requests r on r.id = s.request_id where s.request_id = $1 and not r.is_spam`);
  }
  if (roles.includes('duplicate')) {
    parts.push(`select c.id, 'duplicate', d.reference, c.name_enc, c.email_enc, c.phone_enc, c.preferred_channel
                  from public.request_contacts c join public.requests d on d.id = c.request_id
                  join public.requests r on r.id = d.duplicate_of where d.duplicate_of = $1 and not r.is_spam and not d.is_spam`);
  }
  if (!parts.length) return [];
  return sql.query<Recipient>(parts.join(' union all '), [requestId]);
}

type Deps = { send: typeof sendEmail; plan: (to: string) => { queue: boolean; delivers: boolean } };

/** Writes the emails of one event (idempotent by its key: the same event never emails the same contact twice). */
export async function sendStatusEmails(e: StatusEmailEvent, deps: Deps = { send: sendEmail, plan: (to) => confirmationPlan(to) }): Promise<number> {
  const rows = await withSystem((sql) => statusEmailRecipients(sql, e.requestId, e.kind));
  if (!rows.length) return 0;
  const ring = contactKeyring();
  let queued = 0;
  for (const r of rows) {
    const to = contactEmail(openContact(r, ring));
    if (!to || !deps.plan(to).queue) continue;
    const words = statusEmail(e.kind, { reference: r.reference, state: e.state ?? null, role: r.role });
    await deps.send({
      to,
      subject: words.subject,
      template: `atencion_${e.kind}`,
      element: createElement(NoticeEmail, { appName: SITE_NAME, title: words.title, body: words.body, url: lookupUrl(), cta: 'Consultar mi solicitud', footer: CITIZEN_EMAIL_FOOTER }),
      idempotencyKey: `atencion-${e.kind}:${e.key}:${r.contact_id}`,
    });
    queued++;
  }
  return queued;
}

/** After the response (the team's action already committed): the emails of this event. Never throws, never logs a contact. */
export function queueStatusEmails(e: StatusEmailEvent): void {
  after(async () => {
    try {
      await sendStatusEmails(e);
    } catch (err) {
      console.error(`[atencion] correo de estado (${e.kind}): ${(err as Error).message}`);
    }
  });
}
