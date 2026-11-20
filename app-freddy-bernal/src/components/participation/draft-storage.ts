// The form's draft lives in this tab only (sessionStorage, design §4): it survives a reload, a dropped connection or an
// error, and goes away with the tab. Every access is wrapped: private mode, blocked site data or a full phone make
// storage throw, and then the draft lives in memory until the page reloads. Nothing else of the person is stored. Also
// here, as it reads the browser too: whether the form's page came back as the person left it (formCameBack).

const memory = new Map<string, string>();

function store(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

export function readDraft(key: string): string | null {
  try {
    const v = store()?.getItem(key);
    if (v != null) return v;
  } catch {
    /* unavailable: memory below */
  }
  return memory.get(key) ?? null;
}

export function writeDraft(key: string, value: string): void {
  memory.set(key, value);
  try {
    store()?.setItem(key, value);
  } catch {
    /* full or unavailable: memory keeps it for this visit */
  }
}

export function removeDraft(key: string): void {
  memory.delete(key);
  try {
    store()?.removeItem(key);
  } catch {
    /* unavailable */
  }
}

let formStarted = false;

/**
 * Whether the form now starting is the page the browser brought back as the person left it: a reload, or Back or
 * Forward to it from another site (the browser's navigation timing). Only the first form of a page load, at the address
 * the browser loaded, can be: a link of the site to the form (a soft navigation) and the address typed or followed are
 * new visits, where the address's choice wins (form-core.ts resumeDraft). Without the timing, never.
 */
export function formCameBack(): boolean {
  if (formStarted) return false;
  formStarted = true;
  try {
    const nav = globalThis.performance?.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
    return !!nav && (nav.type === 'reload' || nav.type === 'back_forward') && nav.name === globalThis.location?.href;
  } catch {
    return false;
  }
}
