import 'server-only';
import { driveIsFake } from '../provider';

// Every request to Google goes through here: the in-memory fake answers when DRIVE_FAKE is on
// with the demo database, the real fetch otherwise (tests replace globalThis.fetch).
export async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  if (driveIsFake()) {
    const { fakeDrive } = await import('./fake');
    return fakeDrive().fetch(url, init);
  }
  return fetch(url, init);
}

// Pauses between attempts on rate limits and 5xx (Google asks for exponential backoff).
// Tests set them to zero.
export const driveTiming = { retryMs: [400, 1500, 4000] };

export const pause = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());
