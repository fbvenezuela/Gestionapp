// The «Más», «Crear» and «Mi cuenta» menus are plain <details>: they open and close without
// JavaScript. With it they also close like any other menu: a tap outside, Escape (the focus
// goes back to the summary, so a keyboard user does not lose their place), or the focus moving
// out of it (Tab past the last item, or to another menu). Opening one closes the others, so two
// panels never sit on top of each other. Pure, so it can be tested.

type Focusable = { focus(): void };
type Down = { target: unknown };
type Key = { key: string };
type FocusMove = { relatedTarget: unknown };
export type MenuEl = {
  open: boolean;
  contains(node: unknown): boolean;
  querySelector(selector: 'summary'): Focusable | null;
  addEventListener(type: 'focusout', fn: (e: FocusMove) => void): void;
  addEventListener(type: 'toggle', fn: () => void): void;
  removeEventListener(type: 'focusout', fn: (e: FocusMove) => void): void;
  removeEventListener(type: 'toggle', fn: () => void): void;
};
export type MenuDoc = {
  body: unknown;
  activeElement: unknown;
  addEventListener(type: 'pointerdown', fn: (e: Down) => void): void;
  addEventListener(type: 'keydown', fn: (e: Key) => void): void;
  removeEventListener(type: 'pointerdown', fn: (e: Down) => void): void;
  removeEventListener(type: 'keydown', fn: (e: Key) => void): void;
};

// Every mounted menu of the page.
const mounted = new Set<MenuEl>();

/** Starts listening; returns the function that stops it. */
export function dismissMenu(menu: MenuEl, doc: MenuDoc, group: Set<MenuEl> = mounted): () => void {
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
  // No relatedTarget: the focus went nowhere (another window, a tap on plain text); the tap
  // outside already handles the second case.
  const onFocusOut = (e: FocusMove) => {
    if (menu.open && e.relatedTarget && !menu.contains(e.relatedTarget)) menu.open = false;
  };
  const onToggle = () => {
    if (!menu.open) return;
    for (const other of group) if (other !== menu && other.open) other.open = false;
  };
  group.add(menu);
  doc.addEventListener('pointerdown', onDown);
  doc.addEventListener('keydown', onKey);
  menu.addEventListener('focusout', onFocusOut);
  menu.addEventListener('toggle', onToggle);
  return () => {
    group.delete(menu);
    doc.removeEventListener('pointerdown', onDown);
    doc.removeEventListener('keydown', onKey);
    menu.removeEventListener('focusout', onFocusOut);
    menu.removeEventListener('toggle', onToggle);
  };
}
