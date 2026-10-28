import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { FichaGroup } from './ficha-group';
import { FichaValue } from './ficha-value';
import { PhotoGallery } from './photo-gallery';
import type { FichaTab } from '@/lib/domain/ficha-tab';
import type { FichaMedia } from '@/lib/data/fichas';
import { OBRA_KINDS, OBRA_PHOTO_KINDS, REPORT_KINDS, REPORT_PHOTO_KINDS } from '@/lib/domain/media-mime';

// The «Ficha de obra» / «Reporte» tab of an event born from a ficha (cambios del 27/10/2026, §4.1): what the IVT (or
// política) loaded, live from the ficha (never a stale copy), with its photos. Server-only: what reaches the page is
// exactly what `tab` holds (ficha-tab.ts: for Redes and Grabación the main part only, without names, phones or the
// ficha's own days); the contacts box only for whoever the database gives them, with 2FA (an obra's: the boss,
// despacho and administración; a report's: the boss and despacho here, política on the report, never administración,
// D-41). Its documents (a denuncia, an acta: names and phones of the community) go with the contacts; without them,
// only the photos.
export function EventFichaTab({
  kind, id, code, tab, media, contacts,
}: { kind: 'obra' | 'report'; id: string; code: string; tab: FichaTab; media: FichaMedia[]; contacts: boolean }) {
  const obra = kind === 'obra';
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <Card>
          <CardHeader
            title={`${obra ? 'Ficha de obra' : 'Reporte comunitario'} ${code}`}
            subtitle={
              obra
                ? contacts
                  ? 'Lo que cargó el IVT, al día.'
                  : 'Lo que cargó el IVT, al día. Sin contactos, nombres de la comunidad ni teléfonos.'
                : 'Lo que cargó el director de política, al día.'
            }
          />
          {tab.groups.length ? null : (
            <CardBody>
              <p className="text-[15px] text-text-2">La ficha todavía no tiene datos para mostrar.</p>
            </CardBody>
          )}
        </Card>
        {tab.groups.map((g) => (
          <FichaGroup key={g.key} title={g.title}>
            <dl className="grid gap-4 sm:grid-cols-2">
              {g.items.map((it) => (
                <FichaValue key={it.def.key} def={it.def} value={it.value} mark={it.mark} wide={it.def.type === 'long' || it.def.type === 'url'} />
              ))}
            </dl>
          </FichaGroup>
        ))}
        {contacts && tab.contacts.length ? (
          <Card>
            <CardHeader
              title={obra ? 'Contactos y lo que debe saber el jefe' : 'Persona que reporta, dirección y fecha'}
              subtitle={
                obra
                  ? 'Solo el jefe, el despacho y Administración, con doble factor. Nunca Redes ni Grabación.'
                  : 'Solo el jefe, el despacho y política, con doble factor. Nunca Administración, Redes ni Grabación.'
              }
            />
            <CardBody>
              <dl className="grid gap-4 sm:grid-cols-2">
                {tab.contacts.map((it) => (
                  <FichaValue key={it.def.key} def={it.def} value={it.value} mark={it.mark} wide={it.def.type === 'long'} />
                ))}
              </dl>
            </CardBody>
          </Card>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <PhotoGallery
          target={obra ? { obraFichaId: id } : { reportId: id }}
          kinds={obra ? (contacts ? OBRA_KINDS : OBRA_PHOTO_KINDS) : contacts ? REPORT_KINDS : REPORT_PHOTO_KINDS}
          media={media}
          canUpload={false}
          title={obra ? (contacts ? 'Fotos y documentos' : 'Fotos del antes y del avance') : 'Evidencias'}
        />
      </div>
    </div>
  );
}
