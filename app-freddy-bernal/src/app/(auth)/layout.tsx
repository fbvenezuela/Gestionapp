import { brand } from '@/lib/client-config';
import { LegalLinks } from '@/components/legal-links';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-[var(--radius-control)] bg-accent text-lg font-bold text-on-accent">{brand.logoText}</span>
        <div>
          <p className="text-lg font-bold leading-tight">{brand.appName}</p>
          <p className="text-sm text-text-2">Plataforma interna del equipo</p>
        </div>
      </div>
      {children}
      <LegalLinks />
    </main>
  );
}
