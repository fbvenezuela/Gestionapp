// The ISR and data cache of the e2e server that shows the invented real-content fixture (playwright.config.ts, project
// «real-fixture»; next.config.ts loads it only with E2E_MEMORY_CACHE=1). The other servers of the suite share the same
// .next build, whose pages were prerendered with the INVENTED content: Next's own cache would first serve those pages
// (its «seeds») and would write the fixture's pages into .next for the other servers to read. This one lives in this
// process's memory only: a page is rendered on its first request from this server's own demo database (the fixture's),
// then kept and revalidated as usual. Tags expire as in Next's file-system cache (the same shared tags manifest).
// Test plumbing only: never set on Vercel or in a real deployment.
import tags from 'next/dist/server/lib/incremental-cache/tags-manifest.external.js';

const { tagsManifest } = tags;

const entries = new Map();

export default class MemoryCacheHandler {
  async get(key) {
    return entries.get(key) ?? null;
  }

  async set(key, data, ctx) {
    if (!data) {
      entries.delete(key);
      return;
    }
    entries.set(key, { value: data, lastModified: Date.now(), cacheControl: ctx && !ctx.fetchCache ? ctx.cacheControl : undefined });
  }

  async revalidateTag(tags, durations) {
    const now = Date.now();
    for (const tag of typeof tags === 'string' ? [tags] : tags) {
      const entry = tagsManifest.get(tag) || {};
      if (durations) tagsManifest.set(tag, { ...entry, stale: now, ...(durations.expire !== undefined ? { expired: now + durations.expire * 1000 } : {}) });
      else tagsManifest.set(tag, { ...entry, expired: now });
    }
  }

  resetRequestCache() {}
}
