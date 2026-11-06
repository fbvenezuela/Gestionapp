// The attention desk's contacts on /atencion (web_settings 'site.contacts', edited by the team in the admin): only the
// ones marked verified are shown (D-95: never an invented phone, email or schedule; the demo has none, so the page shows
// its empty state). Any shape the admin may save is read defensively: a label, a value, an optional kind and note, and
// `verified: true`. Links are made here and only of three kinds: tel: (digits only), mailto: (a plain address) and an
// https page. Pure.

export type ContactKind = 'phone' | 'whatsapp' | 'email' | 'web' | 'address' | 'other';
export type VerifiedContact = { label: string; value: string; kind: ContactKind; href: string | null; note: string };

const KINDS: readonly ContactKind[] = ['phone', 'whatsapp', 'email', 'web', 'address', 'other'];
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function hrefOf(kind: ContactKind, value: string): string | null {
  if (kind === 'phone') {
    const digits = value.replace(/[^\d+]/g, '');
    return /^\+?\d{7,15}$/.test(digits) ? `tel:${digits}` : null;
  }
  if (kind === 'whatsapp') {
    const digits = value.replace(/\D/g, '');
    return /^\d{7,15}$/.test(digits) ? `https://wa.me/${digits}` : null;
  }
  if (kind === 'email') return /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(value) ? `mailto:${value}` : null;
  if (kind === 'web') {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' ? u.toString() : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** The verified contacts in the order the team saved them; anything unverified or malformed is left out. */
export function verifiedContacts(raw: unknown): VerifiedContact[] {
  if (!Array.isArray(raw)) return [];
  const out: VerifiedContact[] = [];
  for (const item of raw.slice(0, 30)) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    if (c.verified !== true) continue;
    const label = str(c.label, 80);
    const value = str(c.value, 200);
    if (!label || !value) continue;
    const kind = (KINDS as readonly string[]).includes(String(c.kind)) ? (c.kind as ContactKind) : 'other';
    out.push({ label, value, kind, href: hrefOf(kind, value), note: str(c.note, 200) });
  }
  return out;
}
