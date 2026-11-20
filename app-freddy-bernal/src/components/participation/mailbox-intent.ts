'use client';

import { isDoorMailbox, type DoorMailbox } from '@/lib/participation/mailboxes';

// Which door the person tapped (design of the new website, §5.1): the home's and the menu's doors set it right before a
// soft navigation to the one neutral address (/atencion/buzones), and that page opens the chosen mailbox. It lives ONLY
// in this module's memory: never in storage, the address, the title or the history, so nothing outside the page can tell
// which mailbox a person used. A new tab, a reload or a browser without JavaScript lands on the chooser. One shot: the
// page reads it once (peek in its first render, clear right after) and it expires on its own, so an old tap never opens
// a mailbox later. A browser-only module: on the server nothing is ever set (no state shared between visitors).

/** How long a tap counts: enough for the navigation; an old one never chooses for the person. */
export const MAILBOX_INTENT_TTL_MS = 60_000;

let pending: { id: DoorMailbox; at: number } | null = null;

/** The door that was tapped. False (and nothing kept) for anything but one of the three doors, or on the server. */
export function setMailboxIntent(id: DoorMailbox, now: number = Date.now()): boolean {
  if (typeof window === 'undefined' || !isDoorMailbox(id)) return false;
  pending = { id, at: now };
  return true;
}

/** The tapped door while it counts, without using it up (a render may run twice). */
export function peekMailboxIntent(now: number = Date.now()): DoorMailbox | null {
  if (!pending) return null;
  if (now - pending.at > MAILBOX_INTENT_TTL_MS || now < pending.at) {
    pending = null;
    return null;
  }
  return pending.id;
}

/** Forget the tap (the page calls it once it opened the mailbox, or when the person goes back to the chooser). */
export function clearMailboxIntent(): void {
  pending = null;
}

/** Read the tap and forget it in one step. */
export function takeMailboxIntent(now: number = Date.now()): DoorMailbox | null {
  const id = peekMailboxIntent(now);
  pending = null;
  return id;
}
