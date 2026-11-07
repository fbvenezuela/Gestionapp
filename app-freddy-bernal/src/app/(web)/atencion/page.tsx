import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { ArrowRight, ChevronDown, ClipboardList, KeyRound, Lock, MessagesSquare, PhoneCall, Search, Send } from 'lucide-react';
import { REQUEST_TYPES } from '@/lib/participation/input';
import { Band, BtnLink, Notice, PageIntro, webCard } from '@/components/participation/kit';
import { ParticipationNav } from '@/components/participation/participation-nav';
import { RichTextLite } from '@/components/participation/rich-text-lite';
import { DENUNCIA_NOTICE, EMERGENCY_LEAD, EMERGENCY_REST, STATE_PLAIN, TYPE_COPY, USUAL_PATH } from '@/components/participation/words';
import { cn } from '@/lib/cn';
import { loadAttentionFaqs, loadVerifiedContacts } from './_lib/data';

export const metadata: Metadata = {
  title: 'Atención ciudadana',
  description: 'Envíe reportes, peticiones, acotaciones o denuncias al despacho del gobernador y consulte su estado con un código. No requiere registro.',
  alternates: { canonical: '/atencion' },
};

const STEPS = [
  { icon: ClipboardList, title: 'Envío de la solicitud', text: 'Indique qué ocurre y dónde. Puede adjuntar fotos o documentos. No necesita registrarse.' },
  { icon: KeyRound, title: 'Comprobante', text: 'Al enviar recibirá un código y una clave. Con ambos podrá consultar su solicitud. La clave solo la tiene usted.' },
  {
    icon: Send,
    title: 'Revisión y asignación',
    text: 'El personal de atención revisa la solicitud, la asigna al área correspondiente y fija una fecha de atención según su urgencia.',
  },
  { icon: MessagesSquare, title: 'Seguimiento', text: 'En «Consultar mi solicitud» puede ver el estado, leer las respuestas y agregar información.' },
];

// How the attention desk works (design §4): the two big buttons, the kinds of request, the steps, the states, the
// denuncia's confidentiality, the FAQs of the group «atencion» (the section shows only when there are some) and the
// verified contacts (an empty state while there are none: no invented phones or emails, D-95). The citizen is «usted»;
// whoever attends is «el personal de atención» (copy audit §1). Everything here is public and read as anon, at request
// time (the FAQs and the contacts are edited in the admin and show at once; never read while building).
export default async function AttentionPage() {
  await connection();
  const [faqs, contacts] = await Promise.all([loadAttentionFaqs(), loadVerifiedContacts()]);

  return (
    <div className="w-full bg-ivory text-text">
      <Band className="pb-8 sm:pb-12">
        <ParticipationNav current="inicio" />
        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <PageIntro
            title="Atención ciudadana"
            lead="Envíe su reporte, petición o denuncia y consulte su estado con el código que recibirá. No necesita registrarse."
          >
            <div className="mt-2 flex flex-col gap-3 sm:flex-row">
              <BtnLink href="/atencion/nueva" tone="action" size="lg">
                Nueva solicitud <ArrowRight className="h-5 w-5" aria-hidden />
              </BtnLink>
              <BtnLink href="/atencion/consultar" tone="outline" size="lg">
                <Search className="h-5 w-5" aria-hidden /> Consultar mi solicitud
              </BtnLink>
            </div>
            <p className="flex items-start gap-2 text-[15px] leading-snug text-text-2">
              <PhoneCall className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
              <span>
                <strong className="font-semibold text-text">{EMERGENCY_LEAD}</strong> {EMERGENCY_REST}
              </span>
            </p>
          </PageIntro>
          <figure aria-label="Ejemplo de comprobante" className="relative mx-auto w-full max-w-sm rotate-1 rounded-[var(--radius-card)] border-2 border-text bg-surface p-6 shadow-[var(--glass-shadow-pop)] motion-reduce:rotate-0">
            <p className="text-sm font-semibold uppercase tracking-[0.08em] text-text-2">Ejemplo de comprobante</p>
            <dl className="mt-4 flex flex-col gap-3 font-mono">
              <div>
                <dt className="font-sans text-sm text-text-2">Código</dt>
                <dd className="text-xl font-bold tracking-wider text-text">AC-2026-······</dd>
              </div>
              <div>
                <dt className="font-sans text-sm text-text-2">Clave</dt>
                <dd className="text-xl font-bold tracking-wider text-text">····-····-····-····</dd>
              </div>
            </dl>
            <figcaption className="mt-4 text-[15px] leading-snug text-text-2">Puede descargarlo en PDF, imprimirlo o copiarlo.</figcaption>
          </figure>
        </div>
      </Band>

      <Band className="bg-surface" aria-labelledby="tipos">
        <h2 id="tipos" className="max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Tipos de solicitud
        </h2>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REQUEST_TYPES.map((t) => {
            const big = t === 'reporte';
            const dark = t === 'denuncia';
            return (
              <li key={t} className={cn(big && 'sm:col-span-2 lg:row-span-2 lg:col-span-1', dark && 'sm:col-span-2 lg:col-span-3')}>
                <Link
                  href={`/atencion/nueva?tipo=${t}`}
                  className={cn(
                    'group flex h-full flex-col justify-between gap-6 rounded-[var(--radius-card)] border p-6 transition-colors motion-reduce:transition-none',
                    big ? 'border-action bg-action text-on-action hover:bg-action-hover' : dark ? 'border-charcoal bg-charcoal text-on-charcoal' : 'border-border bg-ivory text-text hover:border-text',
                  )}
                >
                  <span className="flex flex-col gap-2">
                    {dark ? <Lock className="h-6 w-6" aria-hidden /> : null}
                    <span className={cn('font-bold leading-tight', big ? 'text-3xl' : 'text-xl')}>{TYPE_COPY[t].action}</span>
                    <span className={cn('text-[15px] leading-snug', big || dark ? '' : 'text-text-2')}>{TYPE_COPY[t].hint}</span>
                  </span>
                  <span className="inline-flex items-center gap-2 text-[15px] font-semibold underline-offset-4 group-hover:underline">
                    Empezar <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </Band>

      <Band aria-labelledby="como-funciona">
        <h2 id="como-funciona" className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          Cómo funciona
        </h2>
        <ol className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-3">
              <span className="flex items-center gap-3">
                <span className="text-5xl font-bold leading-none text-action-ink" aria-hidden>
                  {i + 1}
                </span>
                <s.icon className="h-6 w-6 text-accent-ink" aria-hidden />
              </span>
              <h3 className="text-xl font-bold">{s.title}</h3>
              <p className="text-[17px] leading-relaxed text-text-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </Band>

      <Band className="bg-surface" aria-labelledby="estados">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <h2 id="estados" className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Estados de una solicitud
            </h2>
            <p className="mt-4 text-[17px] leading-relaxed text-text-2">
              Cada cambio queda en el historial de la solicitud. Si hace falta más información, se le pedirá por esta misma vía. Cuando la solicitud se
              marque como resuelta, usted podrá confirmar si el problema se resolvió.
            </p>
          </div>
          <ol className="flex flex-col gap-3">
            {USUAL_PATH.map((s) => (
              <li key={s} className="flex gap-4 rounded-2xl border border-border bg-ivory p-4">
                <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-accent" aria-hidden />
                <span>
                  <span className="block font-bold">{STATE_PLAIN[s].label}</span>
                  <span className="block text-[15px] leading-snug text-text-2">{STATE_PLAIN[s].text}</span>
                </span>
              </li>
            ))}
            <li className="rounded-2xl border border-dashed border-border p-4 text-[15px] leading-snug text-text-2">
              También puede pasar a «{STATE_PLAIN.requiere_informacion.label}», o a «{STATE_PLAIN.derivado.label}» si la atiende otro organismo.
            </li>
          </ol>
        </div>
      </Band>

      <Band className="bg-charcoal text-on-charcoal" aria-labelledby="denuncias">
        <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
          <Lock className="h-10 w-10" aria-hidden />
          <div className="flex max-w-3xl flex-col gap-3">
            <h2 id="denuncias" className="text-3xl font-bold leading-tight tracking-tight">
              Denuncias confidenciales
            </h2>
            <p className="text-[17px] leading-relaxed">{DENUNCIA_NOTICE}</p>
            <p className="text-[17px] leading-relaxed">En una denuncia solo se pide el lugar aproximado, sin dirección exacta ni ubicación en el mapa.</p>
            <div>
              <Link
                href="/atencion/nueva?tipo=denuncia"
                className="mt-2 inline-flex min-h-12 items-center gap-2 rounded-[var(--radius-control)] border-2 border-on-charcoal px-5 font-semibold text-on-charcoal hover:bg-on-charcoal hover:text-charcoal"
              >
                Hacer una denuncia <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </Band>

      {faqs.length ? (
        <Band aria-labelledby="preguntas">
          <div className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
            <h2 id="preguntas" className="text-3xl font-bold leading-tight tracking-tight">
              Preguntas frecuentes
            </h2>
            <div className={cn(webCard, 'flex flex-col divide-y divide-border')}>
              {faqs.map((f) => (
                <details key={f.id} className="group p-5 sm:p-6">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    <span>{f.data.title}</span>
                    <ChevronDown className="h-5 w-5 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                  </summary>
                  <div className="mt-3">
                    <RichTextLite nodes={f.data.answer} />
                  </div>
                </details>
              ))}
            </div>
          </div>
        </Band>
      ) : null}

      <Band className="bg-surface" aria-labelledby="contactos">
        <div className="grid gap-10 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <h2 id="contactos" className="text-3xl font-bold leading-tight tracking-tight">
            Otros canales
          </h2>
          {contacts.length ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {contacts.map((c) => (
                <li key={`${c.label}-${c.value}`} className="rounded-2xl border border-border bg-ivory p-5">
                  <p className="text-sm font-semibold text-text-2">{c.label}</p>
                  {c.href ? (
                    <a href={c.href} className="mt-1 block break-words text-lg font-bold text-accent-ink underline underline-offset-2" {...(c.href.startsWith('https:') ? { rel: 'noopener noreferrer' } : {})}>
                      {c.value}
                    </a>
                  ) : (
                    <p className="mt-1 break-words text-lg font-bold">{c.value}</p>
                  )}
                  {c.note ? <p className="mt-1 text-[15px] text-text-2">{c.note}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <Notice tone="info" title="Por ahora, la atención es por este formulario">
              Ningún funcionario solicita pagos ni claves. Desconfíe de quien lo haga en nombre de la Gobernación.
            </Notice>
          )}
        </div>
      </Band>

      <Band aria-labelledby="atendidos-enlace">
        <div className={cn(webCard, 'flex flex-col items-start gap-4 p-6 shadow-[var(--glass-shadow)] sm:flex-row sm:items-center sm:justify-between sm:p-8')}>
          <div>
            <h2 id="atendidos-enlace" className="text-2xl font-bold">
              Casos atendidos
            </h2>
            <p className="mt-1 text-[17px] text-text-2">Solicitudes resueltas, publicadas sin datos personales.</p>
          </div>
          <BtnLink href="/atencion/atendido" tone="olive" size="md">
            Ver casos atendidos <ArrowRight className="h-4 w-4" aria-hidden />
          </BtnLink>
        </div>
      </Band>
    </div>
  );
}
