// The feed of the month (R4, D-69), pure: what each cell, the picker, the cell's menu and the live line say. The number
// of a place comes only from cellToNumber (src/lib/domain/redes.ts): question 11 changes it there and nowhere else.
// No React here, so the grid, the sheets and the tests read the same words.

import { FEED_SIZE, FORMAT, alreadyIn, spaceLabel, type Format } from '@/lib/domain/redes';
import { fmtAverage } from '@/lib/domain/redes-dashboard';
import type { FeedPiece, PickerItem } from '@/lib/data/redes';

export { feedCellId } from '@/components/redes/card/card-core';

/** What a filled cell is called: «#7 · Post · «Tips para ahorrar agua» · Publicado». */
export function cellPieceName(p: Pick<FeedPiece, 'num' | 'format' | 'title' | 'published'>): string {
  return `#${p.num} · ${FORMAT[p.format].label} · «${p.title}»${p.published ? ' · Publicado' : ''}`;
}

export const optionsLabel = (num: number) => `Opciones del #${num}`;
export const beforeLabel = (num: number) => `Publicar antes (#${num - 1})`;
export const afterLabel = (num: number) => `Publicar después (#${num + 1})`;
export const canBefore = (num: number) => num > 1;
export const canAfter = (num: number) => num < FEED_SIZE;

/** The picker's title: «Mes 1 · Espacio #07». */
export const pickerTitle = (month: string, num: number) => `${month} · ${spaceLabel(num)}`;
export const PICKER_HINT = 'Elige el formato y luego el título.';
/** Asked before moving a piece that already has a place (A11): it is never in two. */
export const moveAsk = (month: string, num: number) => `Está en ${month} · #${num}. ¿La mueves a este espacio?`;

export type PickerTag = { text: string; tone: 'ok' | 'info' | 'neutral' | 'warn' };

/** The tags of a title in the picker: «En este espacio», «Ya en Mes 1 · #4», «De Mes 2», «Sin media». */
export function pickerTags(item: Pick<PickerItem, 'place' | 'otherMonth' | 'monthLabel' | 'hasMedia'>, here: { month: string; num: number }): PickerTag[] {
  const tags: PickerTag[] = [];
  if (item.place && item.place.month === here.month && item.place.num === here.num) tags.push({ text: 'En este espacio', tone: 'ok' });
  else if (item.place) tags.push({ text: alreadyIn(item.place.month, item.place.num), tone: 'info' });
  if (item.otherMonth && item.monthLabel) tags.push({ text: `De ${item.monthLabel}`, tone: 'neutral' });
  if (!item.hasMedia) tags.push({ text: 'Sin media', tone: 'warn' });
  return tags;
}

/** «1 título», «8 títulos». */
export const titlesCount = (n: number) => (n === 1 ? '1 título' : `${n} títulos`);

/** The live line on top of the grid: «● 21 de 24 espacios ocupados en este mes · receptividad media 7,4». */
export function feedLiveText(filled: number, avg: number | null): string {
  const head = `${filled} de ${FEED_SIZE} espacios ocupados en este mes`;
  return avg === null ? head : `${head} · receptividad media ${fmtAverage(avg)}`;
}

/** «Vaciar este mes», said before asking: nothing is deleted. */
export function clearMonthText(label: string, filled: number): string {
  const ask = `¿Vaciar el feed de «${label}»?`;
  if (!filled) return `${ask} No tiene piezas colocadas.`;
  const n = filled === 1 ? 'la pieza colocada queda' : `las ${filled} piezas colocadas quedan`;
  return `${ask} ${n[0].toUpperCase()}${n.slice(1)} «Sin programar»: no se borra ninguna y siguen en su sección. Los demás meses no se tocan.`;
}

/** The profile header's line: «21 publicaciones en Mes 1». */
export const profileCount = (n: number, month: string) => `${n} ${n === 1 ? 'publicación' : 'publicaciones'} en ${month}`;

/** The format's word for screen readers and the icon's key. */
export const formatWord = (f: Format) => FORMAT[f].label;

// The short mark on a place someone jumped to or a piece just moved to (none with reduced motion).
export const FLASH_CLASSES = ['outline', 'outline-4', 'outline-offset-2', 'outline-accent'] as const;
