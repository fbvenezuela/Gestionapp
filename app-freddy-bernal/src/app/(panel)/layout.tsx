import Link from 'next/link';
import { Bell, Plus, Search, UserRound } from 'lucide-react';
import { requireSession, menuRoles, db } from '@/lib/auth/session';
import { createFor, navFor, ROLE_LABEL } from '@/lib/roles';
import { brand } from '@/lib/client-config';
import { isDemo } from '@/lib/env';
import { SideNav, BottomNav } from '@/components/shell/nav';
import { ViewAs } from '@/components/shell/view-as';
import { SunModeScript, SunModeToggle } from '@/components/shell/sun-mode';
import { LiveRefresh } from '@/components/shell/live-refresh';
import { NoPermissionBanner } from '@/components/shell/no-permission-banner';
import { SignOutButton } from '@/components/shell/sign-out-button';
import { MenuDetails } from '@/components/shell/menu-details';
import { AssistantMount } from '@/components/assistant/assistant-mount';
import { buttonVariants } from '@/components/ui/button';

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  const roles = menuRoles(s);
  const { visible, mobile, more } = navFor(roles);
  const unread = await db(s, async (sql) => (await sql.one<{ n: number }>(`select count(*)::int as n from public.notifications where read_at is null`))!.n);
  const create = createFor(roles);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <SunModeScript />
      <LiveRefresh />
      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 overflow-y-auto border-r border-border bg-surface p-4 lg:flex">
        <Link href="/" className="flex items-center gap-2 px-1">
          <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] bg-accent font-bold text-on-accent">{brand.logoText}</span>
          <span className="text-[15px] font-bold leading-tight">{brand.shortName}</span>
        </Link>
        {isDemo() ? <span className="mx-1 w-fit rounded-[var(--radius-chip)] bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-ink">DEMOSTRACIÓN</span> : null}
        <SideNav items={visible} />
        <div className="mt-auto border-t border-border pt-3 text-sm">
          <p className="font-semibold">{s.name}</p>
          <p className="text-text-2">{s.roles.map((r) => ROLE_LABEL[r]).join(' · ')}</p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-surface/95 px-4 backdrop-blur">
          <Link href="/" className="flex items-center gap-2 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-control)] bg-accent font-bold text-on-accent">{brand.logoText}</span>
            <span className="sr-only">{brand.appName}</span>
          </Link>
          <form action="/buscar" className="relative ml-1 hidden max-w-md flex-1 sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input name="q" type="search" placeholder="Buscar evento o pieza" aria-label="Buscar" className="min-h-10 w-full rounded-[var(--radius-control)] border border-border bg-surface-2 pl-9 pr-3 text-[15px]" />
          </form>
          <div className="ml-auto flex items-center gap-1.5">
            {s.roles.includes('admin') ? <div className="hidden md:block"><ViewAs current={s.viewAs} /></div> : null}
            <Link href="/buscar" className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'sm:hidden' })} aria-label="Buscar">
              <Search className="h-5 w-5" aria-hidden />
            </Link>
            {create.length > 0 ? (
              <MenuDetails className="relative">
                <summary className={buttonVariants({ size: 'sm', className: 'list-none [&::-webkit-details-marker]:hidden cursor-pointer' })}>
                  <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Crear</span>
                  <span className="sr-only sm:hidden">Crear</span>
                </summary>
                <div className="absolute right-0 z-30 mt-2 w-56 rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-lg">
                  {create.map((c) => (
                    <Link key={c.href} href={c.href} className="flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-[15px] hover:bg-surface-2">
                      {c.label}
                    </Link>
                  ))}
                </div>
              </MenuDetails>
            ) : null}
            <Link href="/avisos" className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'relative' })} aria-label={unread ? `Avisos: ${unread} sin leer` : 'Avisos'}>
              <Bell className="h-5 w-5" aria-hidden />
              {unread ? <span className="absolute right-1.5 top-1.5 grid min-w-5 place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-on-accent">{unread}</span> : null}
            </Link>
            <MenuDetails className="relative">
              <summary className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'list-none [&::-webkit-details-marker]:hidden cursor-pointer' })} aria-label="Mi cuenta">
                <UserRound className="h-5 w-5" aria-hidden />
              </summary>
              <div className="absolute right-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border border-border bg-surface p-1 shadow-lg">
                <p className="px-3 pt-2 text-sm font-semibold">{s.name}</p>
                <p className="px-3 pb-2 text-xs text-text-2">{s.email}</p>
                {s.roles.includes('admin') ? <div className="px-3 pb-2 md:hidden"><ViewAs current={s.viewAs} /></div> : null}
                <Link href="/perfil" className="flex min-h-11 items-center rounded-[var(--radius-control)] px-3 text-[15px] hover:bg-surface-2">Mi perfil y avisos</Link>
                <SunModeToggle />
                <SignOutButton />
              </div>
            </MenuDetails>
          </div>
        </header>
        {s.viewAs ? (
          <div className="bg-info-soft px-4 py-2 text-sm text-info" role="status">
            Estás viendo los menús de <b>{ROLE_LABEL[s.viewAs]}</b>. Tus permisos no cambian.
          </div>
        ) : null}
        <main id="contenido" className="safe-bottom mx-auto w-full max-w-6xl flex-1 px-4 pt-5">
          <NoPermissionBanner />
          {children}
        </main>
        <AssistantMount />
      </div>
      <BottomNav items={mobile} more={more} />
    </div>
  );
}
