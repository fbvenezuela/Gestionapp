import { firstSegment, isKnownSegment } from '../routes';

// Which old addresses a redirect can serve (the redirects screen, design §2): an address no route of the app answers
// (the proxy looks those up in web_redirects), a news item or project that is no longer there (their pages look up a
// redirect before answering 404) and the old site's queries on the home. Any other address of the site answers by
// itself, so a redirect from it would never be used. Pure.
export function redirectableFrom(path: string): boolean {
  // The old site's queries on the home («/?p=123»): the proxy looks those up as written (src/lib/web/redirects.ts).
  if (/^\/\?(p|page_id|cat|tag|author|m)=[\w-]{1,80}$/.test(path)) return true;
  const bare = path.split('?')[0];
  const first = firstSegment(bare);
  if (!isKnownSegment(first)) return true;
  const parts = bare.split('/').filter(Boolean);
  return (first === 'actualidad' || first === 'gestion') && parts.length === 2 && parts[1] !== 'semanario';
}
