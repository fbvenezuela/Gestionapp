import { LIMITS, copyLength } from '@/lib/domain/copies';

// «Cómo saldrá»: each copy (long, medium, short) with the networks that use it and each
// network's own character limit, so the reviewer sees where it does not fit.

export type Group = 'long' | 'medium' | 'short';
export type SpecRow = { network: string; label: string; copy_max_chars: number; length_group: Group };
export type CopyRow = { length_group: Group; body: string };
export type NetworkFit = { network: string; label: string; max: number; over: number };
export type GroupPreview = { group: Group; body: string; length: number; limit: number; networks: NetworkFit[] };

export const GROUPS: Group[] = ['long', 'medium', 'short'];

export function copyPreview(copies: CopyRow[], specs: SpecRow[]): GroupPreview[] {
  return GROUPS.map((group) => {
    const body = copies.find((c) => c.length_group === group)?.body ?? '';
    const length = copyLength(group, body);
    const networks = specs
      .filter((s) => s.length_group === group)
      .map((s) => ({ network: s.network, label: s.label, max: Number(s.copy_max_chars), over: Math.max(0, length - Number(s.copy_max_chars)) }))
      .sort((a, b) => a.max - b.max || a.label.localeCompare(b.label, 'es'));
    return { group, body, length, limit: LIMITS[group], networks };
  });
}
