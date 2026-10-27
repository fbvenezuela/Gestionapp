// Glass off on weak phones. The translucent surfaces and the blur (globals.css) already need a browser
// that can blur (@supports); on top of that, a phone with little memory (2 GB or less) or with the
// data saver on gets the solid version: <html data-glass="off">. Chromium is the only engine that
// reports deviceMemory, so iPhones and Firefox rely on the @supports gate alone. «Modo sol» is the
// manual way to go solid. Pure, so it can be tested.

export const GLASS_ATTR = 'data-glass';
export const GLASS_OFF = 'off';
export const LOW_MEMORY_GB = 2;

export type GlassNavigator = { deviceMemory?: number; connection?: { saveData?: boolean } | null };
type Root = { setAttribute(name: string, value: string): void };

export function lowEndDevice({ deviceMemory, connection }: GlassNavigator): boolean {
  return (typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory <= LOW_MEMORY_GB) || connection?.saveData === true;
}

export function applyGlass(root: Root, nav: GlassNavigator) {
  if (lowEndDevice(nav)) root.setAttribute(GLASS_ATTR, GLASS_OFF);
}

// Runs while the HTML is read, before the first paint, so a weak phone never draws the glass at all.
export const GLASS_SCRIPT = `(function(){try{var n=navigator,c=n.connection;if((n.deviceMemory>0&&n.deviceMemory<=${LOW_MEMORY_GB})||(c&&c.saveData===true))document.documentElement.setAttribute(${JSON.stringify(GLASS_ATTR)},${JSON.stringify(GLASS_OFF)})}catch(e){}})()`;
