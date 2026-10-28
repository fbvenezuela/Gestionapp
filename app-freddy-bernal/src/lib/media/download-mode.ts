// How «Descargar todo» works in this browser (cambios del 27/10/2026, §5):
//   * 'folder'     desktop Chrome, Edge, Opera: one tap opens a folder picker (File System Access API) and every file
//                  is written there in turn, with a subfolder per kind. Running it again on the same folder skips what
//                  is already complete, so a stop at the daily Drive cap goes on the next day.
//   * 'one-by-one' Firefox, desktop Safari, Android: the files go one after another to Downloads (the browser asks
//                  once to allow several downloads).
//   * 'ios-list'   iPhone and iPad (every browser there is Safari underneath): one «Bajar» per file, because each
//                  download needs its own tap.

export type DownloadMode = 'folder' | 'one-by-one' | 'ios-list';

type Nav = { userAgent?: string; platform?: string; maxTouchPoints?: number };
type Env = { showDirectoryPicker?: unknown; navigator?: Nav };

/** iPhone, iPod, or an iPad (which says it is a Mac with a touch screen). */
export function isAppleTouch(nav: Nav | undefined): boolean {
  if (!nav) return false;
  const ua = nav.userAgent ?? '';
  return /iPad|iPhone|iPod/.test(ua) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
}

export function downloadMode(env: Env | undefined = typeof window === 'undefined' ? undefined : (window as unknown as Env)): DownloadMode {
  if (!env) return 'one-by-one';
  if (typeof env.showDirectoryPicker === 'function') return 'folder';
  if (isAppleTouch(env.navigator)) return 'ios-list';
  return 'one-by-one';
}
