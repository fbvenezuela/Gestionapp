import { FileQuestionMarkIcon, MegaphoneIcon, MessageSquareTextIcon, SearchIcon, ShieldAlertIcon, TriangleAlertIcon } from './icons';
import { REQUEST_TYPE_HINT } from '@/lib/participation/input';
import { EMERGENCY_NOTICE } from '@/lib/participation/notices';
import { ATTENTION, newRequestHref, REPORT_HREF } from '@/lib/web/links';
import { cn } from '@/lib/cn';
import { cardClass, Container, SectionHeading, textLinkClass, WebLink } from './ui';

// The big accesses to citizen attention (the brief's «cuatro accesos grandes» and design §2): «Hacer un reporte» in the
// brand's orange, then a petition, an observation and a denuncia, and «Consultar mi solicitud». Each one opens the form on
// its kind (?tipo=…, the citizen pages). «Not an emergency service» is said right here, where people act, in the one
// legal text of src/lib/participation/notices.ts. The citizen is addressed as «usted», as the public administration does.

const SECONDARY = [
  { href: newRequestHref('peticion'), title: 'Hacer una petición', hint: REQUEST_TYPE_HINT.peticion, Icon: FileQuestionMarkIcon },
  { href: newRequestHref('acotacion'), title: 'Enviar una observación', hint: REQUEST_TYPE_HINT.acotacion, Icon: MessageSquareTextIcon },
  { href: newRequestHref('denuncia'), title: 'Hacer una denuncia', hint: REQUEST_TYPE_HINT.denuncia, Icon: ShieldAlertIcon },
  { href: ATTENTION.lookup, title: 'Consultar mi solicitud', hint: 'Con el código y la clave de su comprobante.', Icon: SearchIcon },
] as const;

export function ParticipationActions({ title, as = 'h2' }: { title: string; as?: 'h1' | 'h2' }) {
  return (
    <section className="bg-surface py-14 sm:py-20">
      <Container>
        <SectionHeading title={title} as={as} intro="No necesita registrarse. Al enviar recibirá un código para consultar el estado de su solicitud." />
        <div className="grid gap-4 lg:grid-cols-12">
          <WebLink
            href={REPORT_HREF}
            className="group flex min-h-64 flex-col justify-between gap-6 rounded-[var(--radius-card)] bg-action p-7 text-on-action shadow-[var(--glass-shadow)] hover:bg-action-hover sm:p-9 lg:col-span-5"
          >
            <MegaphoneIcon className="h-9 w-9" />
            <span>
              <span className="block text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Hacer un reporte</span>
              <span className="mt-3 block text-lg leading-relaxed">{REQUEST_TYPE_HINT.reporte}</span>
            </span>
          </WebLink>
          <ul className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            {SECONDARY.map(({ href, title: label, hint, Icon }) => (
              <li key={href}>
                <WebLink href={href} className={cn(cardClass, 'group flex h-full min-h-40 flex-col gap-3 p-6 hover:border-accent')}>
                  <Icon className="h-7 w-7 text-accent-ink" />
                  <span className="text-xl font-semibold leading-snug text-text">{label}</span>
                  <span className="text-base leading-relaxed text-text-2">{hint}</span>
                </WebLink>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-8 text-base leading-relaxed text-text-2">
          <WebLink href={ATTENTION.newRequest} className={cn(textLinkClass, 'inline-flex min-h-11 items-center')}>
            También puede enviar sugerencias y reconocimientos.
          </WebLink>
        </p>
        <p className="mt-4 flex items-start gap-2 rounded-2xl bg-warn-soft px-4 py-3 text-base font-medium leading-relaxed text-warn">
          <TriangleAlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
          {EMERGENCY_NOTICE}
        </p>
      </Container>
    </section>
  );
}
