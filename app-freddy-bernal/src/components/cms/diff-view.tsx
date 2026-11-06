import { Chip } from '@/components/ui/chip';
import type { SnapshotDiff } from '@/lib/web/cms/diff';

// «Qué cambia si lo publicas»: field by field (before → after) and, for a page, block by block, with the order. Server
// component; plain words.

const KIND_WORD = { added: 'Nuevo', removed: 'Quitado', changed: 'Cambió', hidden: 'Se oculta', shown: 'Se muestra' } as const;
const KIND_TONE = { added: 'ok', removed: 'danger', changed: 'info', hidden: 'warn', shown: 'ok' } as const;

export function DiffView({ diff }: { diff: SnapshotDiff }) {
  if (diff.first) {
    return (
      <p className="text-[15px]">
        Es la primera vez que se publica: todo es nuevo. Revísalo completo en la <b>vista previa</b>.
      </p>
    );
  }
  if (diff.same) return <p className="text-[15px]">El borrador es igual a lo publicado: no hay cambios por publicar.</p>;
  return (
    <div className="flex flex-col gap-4">
      {diff.fields.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-control)] border border-border bg-surface">
          {diff.fields.map((f) => (
            <li key={f.field} className="flex flex-col gap-1 p-3">
              <span className="flex flex-wrap items-center gap-2">
                <Chip tone={KIND_TONE[f.kind]}>{KIND_WORD[f.kind]}</Chip>
                <span className="font-semibold">{f.label}</span>
              </span>
              {f.kind !== 'added' ? (
                <span className="text-sm text-text-2">
                  <span className="font-semibold">Antes:</span> <del className="decoration-danger/60">{f.before}</del>
                </span>
              ) : null}
              {f.kind !== 'removed' ? (
                <span className="text-sm">
                  <span className="font-semibold">Ahora:</span> <ins className="no-underline">{f.after}</ins>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {diff.blocks.length ? (
        <div>
          <h3 className="mb-2 font-semibold">Bloques</h3>
          <ul className="flex flex-col divide-y divide-border rounded-[var(--radius-control)] border border-border bg-surface">
            {diff.blocks.map((b) => (
              <li key={`${b.id}-${b.kind}`} className="flex flex-col gap-1 p-3">
                <span className="flex flex-wrap items-center gap-2">
                  <Chip tone={KIND_TONE[b.kind]}>{KIND_WORD[b.kind]}</Chip>
                  <span className="font-semibold">{b.label}</span>
                </span>
                {b.details.length ? (
                  <ul className="list-disc pl-5 text-sm text-text-2">
                    {b.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {diff.reordered ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h3 className="mb-1 font-semibold">Orden publicado</h3>
            <ol className="list-decimal pl-5 text-sm text-text-2">
              {diff.reordered.before.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
          </div>
          <div>
            <h3 className="mb-1 font-semibold">Orden nuevo</h3>
            <ol className="list-decimal pl-5 text-sm">
              {diff.reordered.after.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}
    </div>
  );
}
