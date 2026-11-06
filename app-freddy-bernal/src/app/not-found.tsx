import type { Metadata } from 'next';
import { NotFoundMessage } from '@/components/web/not-found-message';
import { PublicChrome } from '@/components/web/public-chrome';
import { getSite } from '@/lib/web/site';

export const metadata: Metadata = { title: { absolute: 'Esta página no existe' }, robots: { index: false, follow: false } };

// An address no route answers (an old link, a typo): since `/` is the public website (D-91), it gets the website's 404
// in its own frame, with the way back. The panel keeps its own «No encontramos esto» ((panel)/not-found.tsx) for what is
// missing inside it, and old addresses with a redirect never get here (src/proxy.ts).
export default async function NotFound() {
  const site = await getSite();
  return (
    <PublicChrome site={site}>
      <NotFoundMessage />
    </PublicChrome>
  );
}
