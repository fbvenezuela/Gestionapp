import type { Metadata } from 'next';
import { NotFoundMessage } from '@/components/web/not-found-message';

export const metadata: Metadata = { title: { absolute: 'Esta página no existe' }, robots: { index: false, follow: false } };

// A news item, a project or a page of the website that is not published (or no longer is): the website's 404 inside
// its own frame (the layout draws the header and the footer).
export default function WebNotFound() {
  return <NotFoundMessage />;
}
