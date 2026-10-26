import Link from 'next/link';

// The public pages Google asks for to publish the OAuth app (Drive), linked from the sign-in page.
export function LegalLinks() {
  return (
    <nav aria-label="Información" className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm text-text-2">
      <Link href="/acerca" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">Acerca</Link>
      <Link href="/privacidad" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">Privacidad</Link>
      <Link href="/condiciones" className="inline-flex min-h-11 items-center underline-offset-4 hover:underline">Condiciones</Link>
    </nav>
  );
}
