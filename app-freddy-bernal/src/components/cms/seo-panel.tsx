'use client';

import { Globe } from 'lucide-react';
import { SEO_LIMITS, socialCard } from '@/lib/web/cms/seo';
import type { WebKind } from '@/lib/web/schema';
import { useEditor } from './editor-context';
import { CheckField, Group, TextField } from './fields';
import { MediaField, Thumb } from './media-field';

// «Buscadores y redes» (design §2, §3): the title and description search engines show, the image social networks show
// and the canonical address, with a live card of how a shared link looks. Empty fields use the item's own title,
// summary and cover. They live in the draft, so they go through approval with the rest.

type Obj = Record<string, unknown>;

export function SeoPanel({ kind, slug, draft, onChange, baseUrl }: { kind: WebKind; slug: string; draft: Obj; onChange: (seo: Obj) => void; baseUrl: string }) {
  const { media } = useEditor();
  const seo = (draft.seo ?? {}) as Obj;
  const set = (patch: Obj) => {
    const next = Object.fromEntries(Object.entries({ ...seo, ...patch }).filter(([, v]) => v !== undefined && v !== '' && v !== null && v !== false));
    onChange(next);
  };
  const card = socialCard(kind, slug, draft, baseUrl);
  const image = card.imageId ? media[card.imageId] : undefined;
  let host = '';
  try {
    host = new URL(card.url).host;
  } catch {
    host = card.url;
  }
  return (
    <Group title="Buscadores y redes" hint="Si los dejas vacíos, se usan el título, el resumen y la foto principal.">
      <TextField label="Título para buscadores" value={seo.title} onChange={(v) => set({ title: v })} max={SEO_LIMITS.title} ideal={SEO_LIMITS.idealTitle} hint="Hasta unas 60 letras se ve entero en Google." />
      <TextField label="Descripción para buscadores" multiline rows={2} value={seo.description} onChange={(v) => set({ description: v })} max={SEO_LIMITS.description} ideal={SEO_LIMITS.idealDescription} hint="Una o dos frases que inviten a entrar (unas 155 letras)." />
      <MediaField label="Imagen para redes" value={seo.imageId} onChange={(id) => set({ imageId: id ?? undefined })} hint="La que sale al compartir el enlace en WhatsApp, Facebook o X. Mejor horizontal (1200 × 630)." />
      <TextField label="Dirección canónica (opcional)" value={seo.canonical} onChange={(v) => set({ canonical: v.trim() })} max={500} placeholder="Solo si esta página repite otra" inputMode="url" hint="Casi nunca hace falta: úsala solo si el mismo contenido vive en otra dirección." />
      <CheckField label="Pedir a los buscadores que no la muestren" hint="Mientras la web sea de prueba, ningún buscador la muestra de todos modos." checked={seo.noindex === true} onChange={(v) => set({ noindex: v })} />
      <div>
        <p className="mb-2 text-sm font-semibold">Así se ve al compartir el enlace</p>
        <div className="overflow-hidden rounded-[var(--radius-control)] border border-border bg-surface" aria-label="Vista previa del enlace compartido">
          {image ? <Thumb m={image} className="aspect-[1200/630] w-full" sizes="(min-width: 640px) 480px, 100vw" /> : <div className="grid aspect-[1200/630] w-full place-items-center bg-surface-2 text-sm text-text-2">Imagen general de la web</div>}
          <div className="flex flex-col gap-0.5 p-3">
            <span className="flex items-center gap-1 text-xs uppercase tracking-wide text-text-2">
              <Globe className="h-3.5 w-3.5" aria-hidden /> {host}
            </span>
            <span className="line-clamp-2 font-semibold">{card.title}</span>
            {card.description ? <span className="line-clamp-2 text-sm text-text-2">{card.description}</span> : <span className="text-sm text-warn">Sin descripción: escribe un resumen o una descripción para buscadores.</span>}
          </div>
        </div>
        {card.path ? <p className="mt-1 break-all text-xs text-text-2">{card.url}</p> : null}
      </div>
    </Group>
  );
}
