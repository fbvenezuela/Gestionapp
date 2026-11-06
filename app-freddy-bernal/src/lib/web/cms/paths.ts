import { firstSegment, isKnownSegment } from '../routes';

// Which old addresses a redirect can serve (the redirects screen, design §2): an address no route of the app answers
// (the proxy looks those up in web_redirects) or a news item or project that is no longer there (their pages look up a
// redirect before answering 404). Any other address of the site answers by itself, so a redirect from it would never be
// used. Pure.
export function redirectableFrom(path: string): boolean {
  const bare = path.split('?')[0];
  const first = firstSegment(bare);
  if (!isKnownSegment(first)) return true;
  const parts = bare.split('/').filter(Boolean);
  return (first === 'actualidad' || first === 'gestion') && parts.length === 2 && parts[1] !== 'semanario';
}
