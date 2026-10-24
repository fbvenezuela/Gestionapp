// What this phone remembers (localStorage): «Modo sol», tips already seen. Every access is
// wrapped, because private mode, blocked site data or a full phone make storage throw; then it
// is remembered in memory until the page reloads. Never put anything sensitive here.

export type KV = { getItem(key: string): string | null; setItem(key: string, value: string): void };

const memory = new Map<string, string>();
const memoryStore: KV = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) };

export const DEVICE_EVENT = 'fb:device';

export function deviceStore(): KV {
  try {
    return globalThis.localStorage ?? memoryStore;
  } catch {
    return memoryStore;
  }
}

export function readKey(store: KV, key: string): string | null {
  try {
    const v = store.getItem(key);
    if (v !== null) return v;
  } catch {
    /* unavailable: fall back to memory */
  }
  return memory.get(key) ?? null;
}

export function writeKey(store: KV, key: string, value: string): void {
  memory.set(key, value);
  try {
    store.setItem(key, value);
  } catch {
    /* unavailable or full: memory keeps it for this visit */
  }
}

// Tells every component on the page (and other tabs, through 'storage') that a value changed.
export function notifyDevice() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DEVICE_EVENT));
}

export function subscribeDevice(cb: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('storage', cb);
  window.addEventListener(DEVICE_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(DEVICE_EVENT, cb);
  };
}
