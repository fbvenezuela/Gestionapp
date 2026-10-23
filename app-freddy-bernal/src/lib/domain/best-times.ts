// "¿A qué hora nos va mejor?" — groups published posts by network, weekday and hour
// band and compares their latest numbers. Never infers political support (rule of the
// model): it only compares views and interaction between time slots.

export type PubPoint = { network: string; publishedAt: Date; views: number | null; interactions: number | null };

export const BANDS = [
  { key: 'madrugada', label: 'Madrugada (0–6)', from: 0, to: 6 },
  { key: 'manana', label: 'Mañana (6–12)', from: 6, to: 12 },
  { key: 'mediodia', label: 'Mediodía (12–15)', from: 12, to: 15 },
  { key: 'tarde', label: 'Tarde (15–19)', from: 15, to: 19 },
  { key: 'noche', label: 'Noche (19–24)', from: 19, to: 24 },
] as const;

export const MIN_POINTS = 3; // fewer than this per slot = "todavía pocos datos"

export type Slot = { band: string; label: string; count: number; avgViews: number | null; avgInteractions: number | null };
export type NetworkBest = { network: string; total: number; slots: Slot[]; best: Slot | null; enoughData: boolean };

export function bestTimes(points: PubPoint[], hourOf: (d: Date) => number): NetworkBest[] {
  const byNet = new Map<string, PubPoint[]>();
  for (const p of points) byNet.set(p.network, [...(byNet.get(p.network) ?? []), p]);
  const out: NetworkBest[] = [];
  for (const [network, list] of byNet) {
    const slots: Slot[] = BANDS.map((b) => {
      const inBand = list.filter((p) => {
        const h = hourOf(p.publishedAt);
        return h >= b.from && h < b.to;
      });
      const views = inBand.map((p) => p.views).filter((v): v is number => v != null);
      const inter = inBand.map((p) => p.interactions).filter((v): v is number => v != null);
      return {
        band: b.key,
        label: b.label,
        count: inBand.length,
        avgViews: views.length ? Math.round(views.reduce((a, c) => a + c, 0) / views.length) : null,
        avgInteractions: inter.length ? Math.round(inter.reduce((a, c) => a + c, 0) / inter.length) : null,
      };
    }).filter((s) => s.count > 0);
    const ranked = [...slots].filter((s) => s.avgViews != null).sort((a, b) => (b.avgViews ?? 0) - (a.avgViews ?? 0));
    const enough = slots.filter((s) => s.count >= MIN_POINTS).length >= 2;
    out.push({ network, total: list.length, slots, best: ranked[0] ?? null, enoughData: enough });
  }
  return out.sort((a, b) => b.total - a.total);
}
