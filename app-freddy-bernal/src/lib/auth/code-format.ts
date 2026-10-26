// How long the codes people type to sign in are. Shared by the forms (browser) and the server
// checks (./codes.ts), so they never disagree. No dependencies: it ships to the browser.

// Code sent by email. Supabase sends 6 to 10 digits: the length is a project setting and new
// hosted projects may send 8. The demo sends 6.
const EMAIL_MIN = 6;
const EMAIL_MAX = 10;
export const EMAIL_CODE = { min: EMAIL_MIN, max: EMAIL_MAX, pattern: `\\d{${EMAIL_MIN},${EMAIL_MAX}}` };

// Code from the authenticator app (TOTP): always 6 digits.
export const TOTP_CODE = { length: 6, pattern: '\\d{6}' };
