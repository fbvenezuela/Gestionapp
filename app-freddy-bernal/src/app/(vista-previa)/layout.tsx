import type { Metadata } from 'next';

// The website administrator's preview (/admin/web/vista-previa/[id], design §3): a draft drawn with the public site's
// own frame and renderer, so it is NOT inside the panel's frame (no menu, no assistant). It asks for the session and the
// role itself (the page), and is never indexed (this metadata, the X-Robots-Tag of /admin and robots.txt).
export const metadata: Metadata = {
  title: { absolute: 'Vista previa · no está publicado' },
  robots: { index: false, follow: false, nocache: true },
};

export default function PreviewLayout({ children }: { children: React.ReactNode }) {
  return children;
}
