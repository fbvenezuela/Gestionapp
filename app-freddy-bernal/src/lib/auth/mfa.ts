import 'server-only';
import { env } from '../env';
import { withSystem } from '../db';

export type MfaStatus = { enrolled: boolean; factorId?: string };

// Whether the person already has a working authenticator (a verified TOTP factor). Read only:
// drawing /doble-factor must never enroll, or a reload would quietly replace the factor the person
// just scanned. A new QR comes only from the mfaEnroll action (a button on that page).
export async function mfaStatus(userId: string): Promise<MfaStatus> {
  if (env.dataMode === 'demo') {
    const f = await withSystem((sql) => sql.one<{ verified: boolean }>(`select verified from demo_auth.totp_factors where user_id = $1`, [userId]));
    return { enrolled: !!f?.verified };
  }
  const { supabaseServer } = await import('../supabase/server');
  const { data } = await (await supabaseServer()).auth.mfa.listFactors();
  const verified = data?.totp?.find((f) => f.status === 'verified');
  return verified ? { enrolled: true, factorId: verified.id } : { enrolled: false };
}
