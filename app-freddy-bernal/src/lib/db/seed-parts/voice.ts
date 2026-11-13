import { getClientConfig } from '../../client-config';
import { endDot } from '../../domain/copies';

// The client's own words in the demo's copies, tweets, storyboards and card fields (APP-07): its greeting, its two
// closings and its hashtags come from config/clients/<brand>.json, as in the copies the app writes at runtime
// (src/lib/actions/pieces.ts), never from the seed's code. The repository is public (nothing about the client in the
// code), and a demo started with an invented client config (the guides' screenshots) says that client's words. With
// config/clients/fb.json every text comes out as it did when they were written here.
const { greeting, closings, hashtags } = getClientConfig().brand;

/** The greeting alone, as the boss says it in a speech. */
export const GREETING = greeting;
/** The greeting that opens a long copy, with its wave. */
export const HELLO = `${greeting} 👋`;
/** The first closing, said in the middle or at the end of a copy («… 👇»). */
export const KEEP_ON = closings[0] ?? '';
/** The second closing (the first when there is only one), as its own words. */
export const LAST_WORDS = closings[1] ?? KEEP_ON;
/** The closing that ends a long copy, with its heart. */
export const LOVE = `💛 ${endDot(LAST_WORDS)}`;
/** The client's first hashtag, at the end of a short copy. */
export const TAG = hashtags[0] ?? '';
/** The client's first two hashtags. */
export const TAGS = hashtags.slice(0, 2).join(' ');
/** A closing said as a sentence: it ends in its period (never after an emoji). */
export const said = endDot;
