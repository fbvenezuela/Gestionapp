import type { Metadata } from 'next';
import { BlockPage, blockPageMetadata } from '@/components/web/block-page';

// The website's privacy notice (D-91): what is asked, for what, who sees it and how to ask to erase it. Its text is the
// page the team and the legal consultation approve (the internal platform's /privacidad is another page).
export const revalidate = 60;

export function generateMetadata(): Promise<Metadata> {
  return blockPageMetadata('aviso-de-privacidad', 'Aviso de privacidad');
}

export default function PrivacyNoticePage() {
  return <BlockPage slug="aviso-de-privacidad" fallbackTitle="Aviso de privacidad" />;
}
