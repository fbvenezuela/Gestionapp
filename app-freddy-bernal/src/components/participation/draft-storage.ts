// The form's draft lives in this tab only (sessionStorage, design §4): it survives a reload, a dropped connection or an
// error, and goes away with the tab. Every access is wrapped: private mode, blocked site data or a full phone make
// storage throw, and then the draft lives in memory until the page reloads. Nothing else of the person is stored.

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
