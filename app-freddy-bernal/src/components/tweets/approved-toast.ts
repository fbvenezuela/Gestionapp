import { toast } from 'sonner';

type Approved = { ok: boolean; data?: { n: number; skipped: number } };

// After «Aprobar marcados» / «Aprobar los N»: how many went, and how many were left out because their text changed
// while the boss was reading (approveTweets never approves a text he did not see).
export function approvedToast(r: Approved) {
  if (!r.ok || !r.data) return;
  const { n, skipped } = r.data;
  if (n) toast.success(n === 1 ? 'Aprobado 1 tweet.' : `Aprobados ${n} tweets.`);
  if (skipped) toast.info(skipped === 1 ? '1 tweet cambió mientras tanto: revísalo de nuevo.' : `${skipped} tweets cambiaron mientras tanto: revísalos de nuevo.`);
}
