import { readKey, writeKey, type KV } from '@/components/ui/device-store';

// «Modo sol»: high contrast and a larger font for reading outdoors. Remembered per phone; the
// colors live in tokens.css under :root[data-contrast='high'].

export const SUN_KEY = 'fb:sun';
export const SUN_ATTR = 'data-contrast';
export const SUN_VALUE = 'high';

type Root = { setAttribute(name: string, value: string): void; removeAttribute(name: string): void };

export function readSun(store: KV): boolean {
  return readKey(store, SUN_KEY) === '1';
}

export function writeSun(store: KV, on: boolean) {
  writeKey(store, SUN_KEY, on ? '1' : '0');
}

export function applySun(root: Root, on: boolean) {
  if (on) root.setAttribute(SUN_ATTR, SUN_VALUE);
  else root.removeAttribute(SUN_ATTR);
}

// Applies the stored value now and again whenever it changes: in this tab (the toggle) or in
// another tab ('storage'), so the colors never get out of step with the switch. Returns the
// unsubscribe function.
export function watchSun(root: Root, store: () => KV, subscribe: (cb: () => void) => () => void): () => void {
  const sync = () => applySun(root, readSun(store()));
  sync();
  return subscribe(sync);
}

// Runs while the HTML is read, before the first paint, so there is no flash of the normal colors.
export const SUN_SCRIPT = `(function(){try{if(localStorage.getItem(${JSON.stringify(SUN_KEY)})==='1')document.documentElement.setAttribute(${JSON.stringify(SUN_ATTR)},${JSON.stringify(SUN_VALUE)})}catch(e){}})()`;
