// The «Más», «Crear» and «Mi cuenta» menus are plain <details>: they open and close without
// JavaScript. With it they also close like any other menu: a tap outside, or Escape (the focus
// goes back to the summary, so a keyboard user does not lose their place). Pure, so it can be
// tested.

type Focusable = { focus(): void };
type Down = { target: unknown };
type Key = { key: string };
export type MenuEl = { open: boolean; contains(node: unknown): boolean; querySelector(selector: 'summary'): Focusable | null };
export type MenuDoc = {
  body: unknown;
  activeElement: unknown;
  addEventListener(type: 'pointerdown', fn: (e: Down) => void): void;
  addEventListener(type: 'keydown', fn: (e: Key) => void): void;
  removeEventListener(type: 'pointerdown', fn: (e: Down) => void): void;
  removeEventListener(type: 'keydown', fn: (e: Key) => void): void;
};

/** Starts listening; returns the function that stops it. */
export function dismissMenu(menu: MenuEl, doc: MenuDoc): () => void {
  const onDown = (e: Down) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  };
  const onKey = (e: Key) => {
    if (e.key !== 'Escape' || !menu.open) return;
    // Only when the focus is in the menu (or nowhere): an Escape elsewhere belongs to that place.
    const at = doc.activeElement;
    if (at && at !== doc.body && !menu.contains(at)) return;
    menu.open = false;
    menu.querySelector('summary')?.focus();
  };
  doc.addEventListener('pointerdown', onDown);
  doc.addEventListener('keydown', onKey);
  return () => {
    doc.removeEventListener('pointerdown', onDown);
    doc.removeEventListener('keydown', onKey);
  };
}
