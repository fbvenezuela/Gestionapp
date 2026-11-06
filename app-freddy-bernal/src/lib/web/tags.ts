// The cache tags of what the public website reads (cache.ts, site.ts) and how often it reads it again by itself. A
// scheduled item becomes visible to anon the moment its time comes (the policy compares publish_at with now()), so the
// pages and their data are read again at most a minute later; publishing calls revalidate.ts to make it immediate.

/** Seconds a public page or list may be served before it is read again (also the pages' `revalidate`). */
export const WEB_REVALIDATE = 60;
/** Settings, catalogs and figures change less: five minutes. */
export const WEB_REVALIDATE_SLOW = 300;

export const WEB_TAG = {
  all: 'web',
  kind: (kind: string) => `web:${kind}`,
  settings: 'web:settings',
  catalogs: 'web:catalogs',
  attended: 'web:attended',
  stats: 'web:stats',
  redirects: 'web:redirects',
} as const;
