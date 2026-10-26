import Link from 'next/link';
import { brand } from '@/lib/client-config';
import { LegalLinks } from '@/components/legal-links';

// Public pages (no session): what the platform is, its privacy policy and its terms.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 py-10">
      <Link href="/acerca" className="mb-8 flex w-fit items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[var(--radius-control)] bg-accent text-lg font-bold text-on-accent">{brand.logoText}</span>
        <span>
          <span className="block text-lg font-bold leading-tight">{brand.appName}</span>
          <span className="block text-sm text-text-2">Plataforma interna del equipo</span>
        </span>
      </Link>
      <article className="flex flex-col gap-4 text-[15px] leading-relaxed [&_a]:underline [&_a]:underline-offset-4 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc">
        {children}
      </article>
      <LegalLinks />
    </main>
  );
}
