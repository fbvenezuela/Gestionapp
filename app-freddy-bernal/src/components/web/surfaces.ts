// The public website's surfaces (design §1: editorial, elegant cards with a discreet border and a soft shadow), in one
// place. The website's own base, like src/components/ui is the panel's: pages and blocks take these classes and never
// draw a card by hand (tests/unit/ui-glass-screens.test.ts). The website is solid by design: the panel's glass stays
// in the panel. No imports, so a client component (the error page) can use them without pulling anything else along.

/** A card that stands on the page: white, a discreet border and a soft shadow. */
export const cardClass = 'rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--glass-shadow)]';

/** The same surface without the shadow: a box that belongs to the page (a list, a filter form, a data sheet). */
export const boxClass = 'rounded-[var(--radius-card)] border border-border bg-surface';
