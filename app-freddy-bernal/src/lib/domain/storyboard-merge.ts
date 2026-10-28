// The storyboard's blocks when two people edit them at the same time (cambios del 27/10/2026, §3: the last save wins,
// with a notice, and nothing typed is lost). Blocks merge BY ID, never as a whole list:
//   * a block someone else added while this person was editing is kept (after this person's blocks);
//   * only the blocks this person removed are removed;
//   * a block this person did not touch keeps what is there now (someone else may have changed it);
//   * a block both changed: this person's version wins and it is an overlap (the other person is told);
//   * a block this person changed and someone else removed: it comes back as a new block (overlap);
//   * a block this person removed and someone else changed: removed (overlap: the other person's text stays in the
//     storyboard's history, with its content).
// Order: this person's when they reordered; otherwise the order there is now, with this person's new blocks after
// the block they follow in this person's list (at the very end when they were added at the end). Pure, so the rules
// can be tested.

export type BoardBlock = { id?: string; shot: string; angle: string; bossLine: string; broll: string; fact: string; factSource: string };

const CONTENT = ['shot', 'angle', 'bossLine', 'broll', 'fact', 'factSource'] as const;
const content = (b: Partial<BoardBlock>) => CONTENT.map((k) => (b[k] ?? '').trim()).join('\u0001');
export const sameContent = (a: Partial<BoardBlock>, b: Partial<BoardBlock>) => content(a) === content(b);

export type BlockMerge = {
  blocks: BoardBlock[]; // the final list, in order (no id = insert)
  remove: string[]; // ids to soft-delete
  overlap: string[]; // ids of blocks someone else had changed or removed too (whom to tell: their last writer)
};

export function mergeBlocks(base: Partial<BoardBlock>[], mine: BoardBlock[], cur: BoardBlock[]): BlockMerge {
  const baseById = new Map(base.filter((b) => b.id).map((b) => [b.id!, b]));
  const curById = new Map(cur.filter((b) => b.id).map((b) => [b.id!, b]));
  const mineIds = new Set(mine.filter((b) => b.id).map((b) => b.id!));
  const overlap: string[] = [];
  const remove: string[] = [];

  // A block of this person's list, as it goes out (null = it does not stay).
  const resolve = (b: BoardBlock): BoardBlock | null => {
    if (!b.id) return b;
    const was = baseById.get(b.id) ?? curById.get(b.id);
    const now = curById.get(b.id);
    const editedByMe = !was || !sameContent(b, was);
    if (!now) {
      // Someone else removed it: back as a new block only if this person changed it.
      if (!editedByMe) return null;
      overlap.push(b.id);
      return { ...b, id: undefined };
    }
    if (!editedByMe) return now;
    if (was && !sameContent(now, was) && !sameContent(now, b)) overlap.push(b.id);
    return b;
  };

  for (const id of baseById.keys()) {
    if (mineIds.has(id) || !curById.has(id)) continue;
    remove.push(id);
    if (!sameContent(curById.get(id)!, baseById.get(id)!)) overlap.push(id);
  }
  const removed = new Set(remove);
  const addedByOthers = cur.filter((b) => b.id && !baseById.has(b.id) && !mineIds.has(b.id));

  const baseOrder = base.filter((b) => b.id && mineIds.has(b.id)).map((b) => b.id!);
  const myOrder = mine.filter((b) => b.id && baseById.has(b.id)).map((b) => b.id!);
  const reordered = baseOrder.join() !== myOrder.join();

  let blocks: BoardBlock[];
  if (reordered) {
    blocks = [...mine.map(resolve).filter((b): b is BoardBlock => !!b), ...addedByOthers];
  } else {
    // The order there is now; this person's new (or brought back) blocks after the block they follow in their list.
    const after = new Map<string, BoardBlock[]>();
    const lead: BoardBlock[] = [];
    let anchor: string | null = null;
    for (const b of mine) {
      if (b.id && curById.has(b.id)) {
        anchor = b.id;
        continue;
      }
      const r = resolve(b);
      if (!r) continue;
      if (anchor) after.set(anchor, [...(after.get(anchor) ?? []), r]);
      else lead.push(r);
    }
    // Added at the end of this person's list: at the end of the merged one too.
    const tail = anchor ? (after.get(anchor) ?? []) : [];
    if (anchor) after.delete(anchor);
    blocks = [...lead];
    for (const b of cur) {
      if (!b.id || removed.has(b.id)) continue;
      const r = mineIds.has(b.id) ? resolve(mine.find((m) => m.id === b.id)!) : b;
      if (r) blocks.push(r);
      blocks.push(...(after.get(b.id) ?? []));
    }
    blocks.push(...tail);
  }
  return { blocks, remove, overlap: [...new Set(overlap)] };
}
