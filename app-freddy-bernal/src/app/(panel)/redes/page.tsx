import { BarChart3, Film, FolderOpen, MessageSquareText, Plus, Send } from 'lucide-react';
import { requireRole, db } from '@/lib/auth/session';
import { PageHeader } from '@/components/ui/page';
import { LinkButton } from '@/components/ui/button';
import { HubTile } from '@/components/home/hub-tile';
import { redesCounts } from '@/lib/data/home-counts';

export const metadata = { title: 'Redes' };

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// The door to Redes (§3: «Redes: piezas, copies, tweets, publicaciones y resultados, con las mismas pantallas que ve
// Redes»): the boss's way in, and Redes may use it too. Each tile opens the very screen Redes works on, with what waits
// there. Nothing here reads the agenda: no event dates, ever (Redes must not see them).
export default async function RedesHub() {
  const s = await requireRole('admin', 'social', 'boss');
  // What waits for the boss opens where he approves; Redes (who does not approve) goes to its own screen.
  const approver = s.roles.some((r) => r === 'boss' || r === 'admin');
  const c = await db(s, (sql) => redesCounts(sql));
  return (
    <>
      <PageHeader title="Redes" subtitle="Las mismas pantallas que usa el equipo de Redes, con lo que espera en cada una." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <HubTile
          id="hub-piezas"
          href="/piezas"
          title="Piezas"
          subtitle="Videos, portadas y carruseles, con sus copies"
          icon={Film}
          counters={[
            { href: '/piezas', value: c.pieces.active, label: 'en curso' },
            { href: '/piezas', value: c.pieces.changes, label: 'con cambios pedidos', tone: 'danger' },
            { href: approver ? '/aprobar' : '/piezas', value: c.pieces.inReview, label: plural(c.pieces.inReview, 'espera al jefe', 'esperan al jefe'), tone: 'warn' },
            { href: '/piezas?ver=aprobadas', value: c.pieces.approved, label: plural(c.pieces.approved, 'aprobada', 'aprobadas') },
          ]}
        />
        <HubTile
          id="hub-tweets"
          href="/tweets"
          title="Tweets"
          subtitle="La semana repartida por horas"
          icon={MessageSquareText}
          counters={[
            { href: '/tweets', value: c.tweets.daysLeft, label: plural(c.tweets.daysLeft, 'día cubierto', 'días cubiertos'), tone: c.tweets.lowStock ? 'danger' : undefined },
            { href: '/tweets', value: c.tweets.upcoming, label: 'por salir' },
            { href: approver ? '/aprobar?tab=tweets' : '/tweets', value: c.tweets.drafts, label: 'por aprobar', tone: 'warn' },
          ]}
        />
        <HubTile
          id="hub-publicar"
          href="/publicar"
          title="Publicar"
          subtitle="Lo aprobado, listo para publicar a mano"
          icon={Send}
          counters={[
            { href: '/publicar', value: c.publish.ready, label: plural(c.publish.ready, 'aprobada y sin publicar', 'aprobadas y sin publicar'), tone: 'ok' },
            { href: '/publicar', value: c.publish.scheduled, label: plural(c.publish.scheduled, 'programada', 'programadas') },
            { href: '/publicar', value: c.publish.failed, label: plural(c.publish.failed, 'falló', 'fallaron'), tone: 'danger' },
          ]}
        />
        <HubTile
          id="hub-resultados"
          href="/resultados"
          title="Resultados"
          subtitle="Cómo le fue a cada publicación y a qué hora nos va mejor"
          icon={BarChart3}
          counters={[
            { href: '/resultados', value: c.results.published30, label: plural(c.results.published30, 'publicación en 30 días', 'publicaciones en 30 días') },
            { href: '/resultados', value: c.results.withoutNumbers, label: 'sin números: carga sus resultados', tone: 'warn' },
          ]}
        />
        <HubTile
          id="hub-biblioteca"
          href="/biblioteca"
          title="Biblioteca"
          subtitle="El material por día y por evento, como el Drive"
          icon={FolderOpen}
          counters={[{ href: '/biblioteca', value: c.library.events, label: plural(c.library.events, 'evento con material', 'eventos con material') }]}
        />
      </div>
      {/* Also in «Crear», at the top; here after the tiles, big, for the iPad and the phone. */}
      <nav aria-label="Crear en Redes" className="mt-5 grid gap-2 sm:flex sm:flex-wrap">
        <LinkButton href="/piezas/nueva" size="lg" className="w-full sm:w-auto"><Plus className="h-5 w-5" aria-hidden /> Nueva pieza</LinkButton>
        <LinkButton href="/tweets/nueva" size="lg" variant="secondary" className="w-full sm:w-auto"><Plus className="h-5 w-5" aria-hidden /> Tweets de la semana</LinkButton>
        <LinkButton href="/publicar/nueva" size="lg" variant="secondary" className="w-full sm:w-auto"><Plus className="h-5 w-5" aria-hidden /> Nueva publicación</LinkButton>
      </nav>
    </>
  );
}
