// Quick reasons for «Pedir cambios»: one tap adds the sentence to the comment, a second tap
// takes it out. Pure, so it is tested in tests/unit/ui-review-reasons.test.ts.

export const QUICK_REASONS = [
  'Muy largo',
  'Falta la fuente de una cifra',
  'Revisar ortografía',
  'Cambiar la portada',
  'Subtítulos',
  'Se oye bajo',
  'Dice fecha u hora',
] as const;

const sentence = (reason: string) => `${reason}.`;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const pattern = (reason: string) => new RegExp(`(^|[\\s.])${escape(reason)}\\.(?=\\s|$)`);

export function hasReason(comment: string, reason: string): boolean {
  return pattern(reason).test(comment);
}

export function toggleReason(comment: string, reason: string): string {
  if (hasReason(comment, reason)) {
    return comment
      .replace(pattern(reason), (_m, before: string) => (before === '.' ? '.' : before))
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/^\s+/, '')
      .replace(/\s+$/, '');
  }
  const base = comment.replace(/\s+$/, '');
  if (!base) return sentence(reason);
  const glue = /[.!?…:]$/.test(base) ? ' ' : '. ';
  return `${base}${glue}${sentence(reason)}`;
}
