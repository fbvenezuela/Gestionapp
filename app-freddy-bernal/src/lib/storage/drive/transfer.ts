import 'server-only';
import { env } from '../../env';
import { withSystem } from '../../db';
import { today } from '../../time';
import { noticeAdmins } from './connection';

// Monthly count of Drive bytes the platform served or relayed (playback, downloads, thumbnails,
// proxied upload chunks). Vercel Hobby includes about 10 GB of origin transfer a month and
// PAUSES the whole project (the published demo too) past it, so the server refuses new Drive
// transfers at DRIVE_TRANSFER_CAP_GB (default 7). 0 = no cap (Vercel Pro).
//
// Every answer RESERVES its bytes before anything is sent (one conditional update, so answers
// running at the same time cannot pass the cap together) and gives back what it did not send
// when it ends. If Vercel cuts a function before that, the reservation simply stays counted: the
// count can run a little high, never low. Each person (Administración aside) also has a daily
// share of the cap, so one account looping requests cannot pause Drive for everyone.

export const transferMonth = (d = new Date()) => d.toISOString().slice(0, 7);
// The person's day, in the team's time zone.
export const transferDay = () => today().toISODate()!;

// Share of the monthly cap one person may use in a day (7 GB → 1,75 GB).
export const PERSON_DAY_SHARE = 0.25;

export function transferCapBytes(): number {
  const gb = env.drive.transferCapGb;
  return Number.isFinite(gb) && gb > 0 ? Math.floor(gb * 1024 ** 3) : Number.POSITIVE_INFINITY;
}

export function personDayBytes(): number {
  const cap = transferCapBytes();
  return Number.isFinite(cap) ? Math.floor(cap * PERSON_DAY_SHARE) : Number.POSITIVE_INFINITY;
}

export async function transferUsed(): Promise<number> {
  const r = await withSystem((sql) => sql.one<{ bytes: string | number }>(`select bytes from public.drive_transfer where month = $1`, [transferMonth()]));
  return Number(r?.bytes ?? 0);
}

/**
 * What is left of this month's cap and of the person's share for today, for «Descargar todo» to say before it
 * starts (cambios del 27/10/2026, §5). null = no limit (no cap, or Administración, which has no daily share). Reads
 * only the month's total and this person's own row of today.
 */
export async function transferLeft(userId: string, admin: boolean): Promise<{ monthLeft: number | null; todayLeft: number | null }> {
  const cap = transferCapBytes();
  if (!Number.isFinite(cap)) return { monthLeft: null, todayLeft: null };
  const { month, mine } = await withSystem(async (sql) => ({
    month: await sql.one<{ bytes: string | number }>(`select bytes from public.drive_transfer where month = $1`, [transferMonth()]),
    mine: admin
      ? null
      : await sql.one<{ bytes: string | number }>(`select bytes from public.drive_transfer_person where day = $1 and user_id = $2`, [transferDay(), userId]),
  }));
  const monthLeft = Math.max(0, cap - Number(month?.bytes ?? 0));
  return { monthLeft, todayLeft: admin ? null : Math.max(0, personDayBytes() - Number(mine?.bytes ?? 0)) };
}

type Personal = { userId: string; day: string } | null;

/** Counts bytes with no check (an answer that turned out longer than reserved). */
export async function addTransfer(bytes: number, personal: Personal = null, month = transferMonth()) {
  if (!(bytes > 0)) return;
  const n = Math.floor(bytes);
  await withSystem(async (sql) => {
    await sql.query(
      `insert into public.drive_transfer (month, bytes) values ($1, $2)
       on conflict (month) do update set bytes = public.drive_transfer.bytes + excluded.bytes, updated_at = now()`,
      [month, n],
    );
    if (personal) {
      await sql.query(
        `insert into public.drive_transfer_person (day, user_id, bytes) values ($1, $2, $3)
         on conflict (day, user_id) do update set bytes = public.drive_transfer_person.bytes + excluded.bytes, updated_at = now()`,
        [personal.day, personal.userId, n],
      );
    }
  });
}

export type Reservation = { month: string; day: string; userId: string | null; bytes: number };
export type Reserved = { ok: true; r: Reservation } | { ok: false; why: 'month' | 'person' };

// Thrown inside the transaction so the month's reservation is rolled back with it.
class PersonOver extends Error {}

/**
 * Reserves `bytes` against this month's cap and, when `userId` is given, against that person's
 * share for today. Nothing is reserved when either would be passed.
 */
export async function reserveTransfer(bytes: number, userId: string | null): Promise<Reserved> {
  const n = Math.max(0, Math.floor(bytes));
  const cap = transferCapBytes();
  const share = personDayBytes();
  const personal = userId != null && Number.isFinite(share);
  const r: Reservation = { month: transferMonth(), day: transferDay(), userId: personal ? userId : null, bytes: n };
  if (n > cap) return { ok: false, why: 'month' };
  try {
    const ok = await withSystem(async (sql) => {
      const m = await sql.one<{ bytes: string }>(
        `insert into public.drive_transfer (month, bytes) values ($1, $2)
         on conflict (month) do update set bytes = public.drive_transfer.bytes + excluded.bytes, updated_at = now()
          where $3::bigint is null or public.drive_transfer.bytes + excluded.bytes <= $3::bigint
         returning bytes`,
        [r.month, n, Number.isFinite(cap) ? cap : null],
      );
      if (!m) return false;
      if (personal) {
        // (The insert below has no check of its own: a first answer bigger than the share.)
        if (n > share) throw new PersonOver();
        const p = await sql.one<{ bytes: string }>(
          `insert into public.drive_transfer_person (day, user_id, bytes) values ($1, $2, $3)
           on conflict (day, user_id) do update set bytes = public.drive_transfer_person.bytes + excluded.bytes, updated_at = now()
            where public.drive_transfer_person.bytes + excluded.bytes <= $4::bigint
           returning bytes`,
          [r.day, userId, n, share],
        );
        if (!p) throw new PersonOver();
      }
      return true;
    });
    return ok ? { ok: true, r } : { ok: false, why: 'month' };
  } catch (e) {
    if (e instanceof PersonOver) return { ok: false, why: 'person' };
    throw e;
  }
}

/** The answer ended having sent `sent` bytes: gives back the rest (or counts the excess). */
export async function settleTransfer(r: Reservation, sent: number) {
  const diff = Math.floor(sent) - r.bytes;
  const personal: Personal = r.userId ? { userId: r.userId, day: r.day } : null;
  if (diff > 0) return addTransfer(diff, personal, r.month);
  if (diff === 0) return;
  await withSystem(async (sql) => {
    await sql.query(`update public.drive_transfer set bytes = greatest(bytes - $2, 0), updated_at = now() where month = $1`, [r.month, -diff]);
    if (personal) {
      await sql.query(
        `update public.drive_transfer_person set bytes = greatest(bytes - $3, 0), updated_at = now() where day = $1 and user_id = $2`,
        [personal.day, personal.userId, -diff],
      );
    }
  });
}

/** Tells Administración once a month that the cap was reached. */
export async function budgetReached() {
  await noticeAdmins({
    kind: 'drive_quota',
    title: 'Se llegó al tope de transferencia de Drive de este mes',
    body: 'Ver y descargar videos de Drive queda en pausa hasta el mes que viene, para que Vercel no pause la plataforma. Ajustes → Google Drive.',
    key: `drive_quota:${transferMonth()}`,
  });
}

/** Tells Administración once a day per person that someone used up their daily share. */
export async function personShareReached(userId: string, on: 'view' | 'upload' = 'view') {
  const who = await withSystem((sql) => sql.one<{ name: string }>(`select nullif(full_name, '') as name from public.profiles where id = $1`, [userId]));
  const name = who?.name ?? 'Una persona del equipo';
  await noticeAdmins({
    kind: 'drive_share',
    title: 'Alguien llegó a su tope de Drive de hoy',
    body:
      on === 'upload'
        ? `${name} ya usó su parte de hoy de Drive y su subida quedó en pausa; mañana sigue. Si urge, que te pase el archivo y súbelo tú.`
        : `${name} ya usó su parte de hoy para ver y descargar de Drive; mañana sigue. Si lo necesita ya, bájalo tú y pásaselo.`,
    key: `drive_share:${transferDay()}:${userId}`,
  });
}
