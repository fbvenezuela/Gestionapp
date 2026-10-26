import { z } from 'zod';
import { EMAIL_CODE, TOTP_CODE } from './code-format';

// Server checks for the typed codes. Two schemas on purpose: the email code may grow with the
// Supabase setting, the authenticator code never changes.
export const emailCodeSchema = z
  .string()
  .trim()
  .regex(new RegExp(`^${EMAIL_CODE.pattern}$`), 'Escribe el código completo que te llegó, solo con números.');

export const totpCodeSchema = z.string().trim().regex(new RegExp(`^${TOTP_CODE.pattern}$`), 'El código tiene 6 números.');
