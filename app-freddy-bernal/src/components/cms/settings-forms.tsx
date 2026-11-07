'use client';

import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, Plus, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { saveSiteSetting } from '@/lib/actions/web-site';
import { NETWORK_LABEL } from '@/lib/web/site-settings';
import { CheckField, SelectField, TextField } from './fields';

// The site's settings (design §3; Administración, the publisher and the boss — can_manage_site): navigation, footer,
// institutional contacts and social accounts (only VERIFIED ones reach the public site and the structured data), the
// WhatsApp channel, the institutional portal, the program's YouTube channel, the identity and structured data, and the
// test version's banner. Each section saves on its own and is live at once (the public pages are refreshed). The two
// legal notices are not settings (src/lib/participation/notices.ts): the page only shows them.

type Obj = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const bool = (v: unknown, d = false) => (typeof v === 'boolean' ? v : d);

function useSave(key: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const save = async (value: unknown, ok = 'Guardado. La web ya lo muestra.') => {
    setBusy(true);
    const r = await saveSiteSetting({ key, value });
    setBusy(false);
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(ok);
      router.refresh();
    }
    return r.ok;
  };
  return { save, busy };
}

function Section({ title, subtitle, children, onSave, busy, saveLabel = 'Guardar' }: { title: string; subtitle?: ReactNode; children: ReactNode; onSave: () => void; busy: boolean; saveLabel?: string }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardBody className="flex flex-col gap-4">
        {children}
        <Button type="button" className="self-start" onClick={onSave} disabled={busy}>
          <Save className="h-4 w-4" aria-hidden /> {busy ? 'Guardando…' : saveLabel}
        </Button>
      </CardBody>
    </Card>
  );
}

/** A list of rows that can be added, moved and removed. */
function Rows<T>({ rows, onChange, render, empty, blank, name, max = 40 }: { rows: T[]; onChange: (r: T[]) => void; render: (row: T, set: (r: T) => void, i: number) => ReactNode; empty: string; blank: T; name: string; max?: number }) {
  const move = (i: number, d: -1 | 1) => {
    const next = [...rows];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      {!rows.length ? <p className="text-sm text-text-2">{empty}</p> : null}
      <ol className="flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-col gap-3 rounded-[var(--radius-control)] border border-border bg-surface p-3">
            {render(r, (next) => onChange(rows.map((x, j) => (j === i ? next : x))), i)}
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir ${name} ${i + 1}`}>
                <ArrowUp className="h-4 w-4" aria-hidden /> Subir
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label={`Bajar ${name} ${i + 1}`}>
                <ArrowDown className="h-4 w-4" aria-hidden /> Bajar
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Quitar ${name} ${i + 1}`}>
                <X className="h-4 w-4" aria-hidden /> Quitar
              </Button>
            </div>
          </li>
        ))}
      </ol>
      {rows.length < max ? (
        <Button type="button" variant="secondary" className="self-start" onClick={() => onChange([...rows, structuredClone(blank)])}>
          <Plus className="h-4 w-4" aria-hidden /> Agregar {name}
        </Button>
      ) : null}
    </div>
  );
}

type Link = { label: string; path: string };
const links = (v: unknown): Link[] => (Array.isArray(v) ? (v as Obj[]).map((l) => ({ label: str(l?.label), path: str(l?.path) })) : []);

export function NavigationForm({ value }: { value: unknown }) {
  const [rows, setRows] = useState(links(value));
  const { save, busy } = useSave('site.navigation');
  return (
    <Section title="Navegación" subtitle="Las secciones del menú de la web, en orden. Cada enlace va a una dirección de esta web (empieza con /)." onSave={() => save(rows)} busy={busy}>
      <Rows
        rows={rows}
        onChange={setRows}
        name="enlace"
        blank={{ label: '', path: '/' }}
        max={12}
        empty="Sin enlaces: el menú quedaría vacío."
        render={(r, set, i) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={`Nombre ${i + 1}`} value={r.label} onChange={(v) => set({ ...r, label: v })} max={40} />
            <TextField label="Dirección" value={r.path} onChange={(v) => set({ ...r, path: v })} max={500} mono placeholder="/gestion" />
          </div>
        )}
      />
    </Section>
  );
}

export function FooterForm({ value }: { value: unknown }) {
  const v = (value ?? {}) as Obj;
  const [about, setAbout] = useState(str(v.about));
  const [legal, setLegal] = useState(links(v.legal));
  const { save, busy } = useSave('site.footer');
  return (
    <Section title="Pie de página" subtitle="Un texto corto sobre la web y los enlaces legales." onSave={() => save({ about, legal })} busy={busy}>
      <TextField label="Texto del pie" multiline rows={3} value={about} onChange={setAbout} max={600} hint="Vacío: no sale. Sin datos que no estén verificados." />
      <Rows
        rows={legal}
        onChange={setLegal}
        name="enlace legal"
        blank={{ label: '', path: '/' }}
        max={8}
        empty="Sin enlaces legales."
        render={(r, set, i) => (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={`Nombre ${i + 1}`} value={r.label} onChange={(x) => set({ ...r, label: x })} max={40} />
            <TextField label="Dirección" value={r.path} onChange={(x) => set({ ...r, path: x })} max={500} mono />
          </div>
        )}
      />
    </Section>
  );
}

type Contact = { label: string; value: string; href?: string; verified: boolean };

export function ContactsForm({ value }: { value: unknown }) {
  const [rows, setRows] = useState<Contact[]>(Array.isArray(value) ? (value as Obj[]).map((c) => ({ label: str(c.label), value: str(c.value), href: str(c.href) || undefined, verified: bool(c.verified) })) : []);
  const { save, busy } = useSave('site.contacts');
  return (
    <Section
      title="Contactos institucionales"
      subtitle="Solo los marcados como verificados salen en la web. Nunca un teléfono o un correo que nadie del equipo confirmó."
      onSave={() => save(rows.map((r) => ({ label: r.label, value: r.value, ...(r.href?.trim() ? { href: r.href.trim() } : {}), verified: r.verified })))}
      busy={busy}
    >
      <Rows
        rows={rows}
        onChange={setRows}
        name="contacto"
        blank={{ label: '', value: '', verified: false }}
        max={20}
        empty="Sin contactos: la web dice que todavía no hay contactos verificados."
        render={(r, set, i) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={`Nombre ${i + 1}`} value={r.label} onChange={(x) => set({ ...r, label: x })} max={80} placeholder="Atención al ciudadano" />
              <TextField label="Dato" value={r.value} onChange={(x) => set({ ...r, value: x })} max={200} placeholder="El teléfono, el correo o la dirección" />
            </div>
            <TextField label="Enlace (opcional)" value={r.href} onChange={(x) => set({ ...r, href: x })} max={500} placeholder="mailto:… o https://…" mono />
            <CheckField label="Verificado" hint="Alguien del equipo lo confirmó: sale en la web." checked={r.verified} onChange={(x) => set({ ...r, verified: x })} />
          </>
        )}
      />
    </Section>
  );
}

type Account = { network: string; label?: string; handle: string; url: string; verified: boolean; active: boolean; note?: string };

export function AccountsForm({ value }: { value: unknown }) {
  const [rows, setRows] = useState<Account[]>(
    Array.isArray(value)
      ? (value as Obj[]).map((a) => ({ network: str(a.network) || 'web', label: str(a.label) || undefined, handle: str(a.handle), url: str(a.url), verified: bool(a.verified), active: bool(a.active, true), note: str(a.note) || undefined }))
      : [],
  );
  const { save, busy } = useSave('site.social_accounts');
  const clean = (a: Account) => ({ network: a.network, ...(a.label?.trim() ? { label: a.label.trim() } : {}), handle: a.handle, url: a.url.trim(), verified: a.verified, active: a.active, ...(a.note?.trim() ? { note: a.note.trim() } : {}) });
  return (
    <Section
      title="Cuentas en redes"
      subtitle="Solo las activas y verificadas salen en la web, en «Canales» y en los datos estructurados (sameAs). En la versión de prueba también salen las «por confirmar», marcadas."
      onSave={() => save(rows.map(clean))}
      busy={busy}
    >
      <Rows
        rows={rows}
        onChange={setRows}
        name="cuenta"
        blank={{ network: 'instagram', handle: '', url: 'https://', verified: false, active: true }}
        max={40}
        empty="Sin cuentas."
        render={(r, set, i) => (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <SelectField label={`Red ${i + 1}`} value={r.network} onChange={(x) => set({ ...r, network: x })} options={Object.entries(NETWORK_LABEL)} />
              <TextField label="Usuario" value={r.handle} onChange={(x) => set({ ...r, handle: x })} max={80} placeholder="@usuario" />
            </div>
            <TextField label="Enlace" value={r.url} onChange={(x) => set({ ...r, url: x })} max={500} mono placeholder="https://…" />
            <TextField label="Nota interna (no sale en la web)" value={r.note} onChange={(x) => set({ ...r, note: x })} max={300} hint="Quién la verificó y cuándo, o por qué no se usa." />
            <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
              <CheckField label="Verificada" hint="Confirmada como cuenta oficial." checked={r.verified} onChange={(x) => set({ ...r, verified: x })} />
              <CheckField label="Activa" hint="Una cuenta abandonada se apaga: nunca sale." checked={r.active} onChange={(x) => set({ ...r, active: x })} />
            </div>
          </>
        )}
      />
    </Section>
  );
}

type Channel = { label: string; handle: string; url: string; verified: boolean; active: boolean; note: string };

export function ChannelForm({ settingKey, title, subtitle, value }: { settingKey: 'site.whatsapp_channel' | 'site.institutional_portal' | 'site.youtube_channel'; title: string; subtitle: string; value: unknown }) {
  const v = (value ?? null) as Obj | null;
  const [on, setOn] = useState(!!v);
  const [c, setC] = useState<Channel>({ label: str(v?.label), handle: str(v?.handle), url: str(v?.url), verified: bool(v?.verified), active: bool(v?.active, true), note: str(v?.note) });
  const { save, busy } = useSave(settingKey);
  const value_ = on
    ? { ...(c.label.trim() ? { label: c.label.trim() } : {}), ...(c.handle.trim() ? { handle: c.handle.trim() } : {}), url: c.url.trim(), verified: c.verified, active: c.active, ...(c.note.trim() ? { note: c.note.trim() } : {}) }
    : null;
  return (
    <Section title={title} subtitle={subtitle} onSave={() => save(value_)} busy={busy}>
      <CheckField label="La web lo muestra" hint="Apágalo si todavía no existe o no está confirmado." checked={on} onChange={setOn} />
      {on ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Nombre" value={c.label} onChange={(x) => setC({ ...c, label: x })} max={80} />
            <TextField label="Usuario o número" value={c.handle} onChange={(x) => setC({ ...c, handle: x })} max={80} />
          </div>
          <TextField label="Enlace" value={c.url} onChange={(x) => setC({ ...c, url: x })} max={500} mono placeholder="https://…" />
          <TextField label="Nota interna (no sale en la web)" value={c.note} onChange={(x) => setC({ ...c, note: x })} max={300} />
          <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
            <CheckField label="Verificado" hint="Sin verificar, en producción no sale." checked={c.verified} onChange={(x) => setC({ ...c, verified: x })} />
            <CheckField label="Activo" checked={c.active} onChange={(x) => setC({ ...c, active: x })} />
          </div>
        </>
      ) : null}
    </Section>
  );
}

export function IdentityForm({ identity, structured }: { identity: unknown; structured: unknown }) {
  const i = (identity ?? {}) as Obj;
  const sd = (structured ?? {}) as Obj;
  const [id, setId] = useState({ name: str(i.name), title: str(i.title), region: str(i.region), greeting: str(i.greeting), wordmark: str(i.wordmark) });
  const [st, setSt] = useState({ personName: str(sd.personName), jobTitle: str(sd.jobTitle), organizationName: str(sd.organizationName) });
  const a = useSave('site.identity');
  const b = useSave('site.structured_data');
  const opt = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).filter(([, x]) => x.trim()).map(([k, x]) => [k, x.trim()]));
  return (
    <>
      <Section title="Nombre y saludo" subtitle="Cómo se nombra la web en la cabecera, el título de cada página y el saludo de la portada." onSave={() => a.save(opt(id))} busy={a.busy}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Nombre" value={id.name} onChange={(x) => setId({ ...id, name: x })} max={120} />
          <TextField label="Cargo" value={id.title} onChange={(x) => setId({ ...id, title: x })} max={160} />
          <TextField label="Región" value={id.region} onChange={(x) => setId({ ...id, region: x })} max={80} />
          <TextField label="Saludo" value={id.greeting} onChange={(x) => setId({ ...id, greeting: x })} max={120} />
        </div>
        <TextField label="Nombre de la cabecera" value={id.wordmark} onChange={(x) => setId({ ...id, wordmark: x })} max={200} hint="Vacío: «Nombre · Cargo»." />
      </Section>
      <Section title="Datos estructurados" subtitle="Lo que leen los buscadores sobre la persona y la institución (JSON-LD). Las cuentas de sameAs salen solo de las verificadas." onSave={() => b.save(opt(st))} busy={b.busy}>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Nombre de la persona" value={st.personName} onChange={(x) => setSt({ ...st, personName: x })} max={120} />
          <TextField label="Cargo" value={st.jobTitle} onChange={(x) => setSt({ ...st, jobTitle: x })} max={160} />
        </div>
        <TextField label="Institución" value={st.organizationName} onChange={(x) => setSt({ ...st, organizationName: x })} max={200} />
      </Section>
    </>
  );
}

export function TextSettingForm({ settingKey, title, subtitle, value, max }: { settingKey: 'site.demo_banner'; title: string; subtitle: string; value: unknown; max: number }) {
  const [text, setText] = useState(str(value));
  const { save, busy } = useSave(settingKey);
  return (
    <Section title={title} subtitle={subtitle} onSave={() => save(text.trim())} busy={busy}>
      <TextField label="Texto" multiline rows={2} value={text} onChange={setText} max={max} />
    </Section>
  );
}
