'use client';

import { useState } from 'react';
import { BookOpenText, Wand2 } from 'lucide-react';
import { saveObraDialog } from '@/lib/actions/obras';
import { useAction } from '@/lib/hooks/use-action';
import { Button, LinkButton } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Textarea } from '@/components/ui/field';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { FAB_GENERATED_BY, type FabGeneratedBy } from '@/lib/data/ficha-labels';

// «Generame un diálogo FAB con esto» (§4.1): the button fills the box with «Lo que voy a decir» built from the
// ficha (Característica → Ventaja → Beneficio, the boss's voice, only the ficha's own figures), and it can be
// changed before saving. With the AI off it is the template (src/lib/domain/obra-dialog.ts).
export function FabDialogEditor({
  id,
  saved,
  generatedBy,
  template,
  missing,
  canEdit,
}: {
  id: string;
  saved: string;
  generatedBy: string | null;
  template: string;
  missing: string[];
  canEdit: boolean;
}) {
  const { run, pending } = useAction();
  const { confirm, dialog } = useConfirm();
  const [text, setText] = useState(saved);
  const [shownMissing, setShownMissing] = useState(false);
  const dirty = text.trim() !== saved.trim();

  const generate = async () => {
    if (text.trim() && text.trim() !== template && !(await confirm({ title: '¿Cambiar lo que está escrito?', body: 'El texto de ahora se reemplaza por uno nuevo armado con la ficha.', confirmLabel: 'Reemplazar' }))) return;
    setText(template);
    setShownMissing(true);
  };

  return (
    <Card data-tour="fab">
      {dialog}
      <CardHeader
        title="Lo que voy a decir"
        subtitle="Diálogo FAB: qué es la obra, qué mejora y qué gana la gente. Solo con las cifras de la ficha."
        action={generatedBy && generatedBy in FAB_GENERATED_BY ? <Chip tone="info">{FAB_GENERATED_BY[generatedBy as FabGeneratedBy]}</Chip> : undefined}
      />
      <CardBody className="flex flex-col gap-3">
        {canEdit ? (
          <>
            <Button type="button" variant="secondary" onClick={generate} disabled={pending || !template} className="self-start">
              <Wand2 className="h-4 w-4" aria-hidden /> Generar diálogo FAB
            </Button>
            {!template ? <p className="text-[15px] text-text-2">Faltan datos para armar el diálogo: llena «Sobre la obra» y «Avance y entrega».</p> : null}
            {shownMissing && missing.length ? (
              <div className="rounded-[var(--radius-control)] border border-border bg-surface-2 p-3 text-sm">
                <p className="font-semibold">Lo que la ficha no tiene (no se dice):</p>
                <ul className="mt-1 list-disc pl-5 text-text-2">
                  {missing.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <label htmlFor={`fab-${id}`} className="text-sm font-semibold">Texto para leer (lo puedes cambiar antes de guardar)</label>
            <Textarea id={`fab-${id}`} rows={10} maxLength={6000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Toca «Generar diálogo FAB» o escríbelo aquí." />
            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={pending || !dirty} onClick={() => run(() => saveObraDialog({ id, text }))}>
                Guardar
              </Button>
              {saved ? (
                <LinkButton variant="slate" href={`/obras/${id}/lectura`}>
                  <BookOpenText className="h-4 w-4" aria-hidden /> Modo lectura
                </LinkButton>
              ) : null}
            </div>
          </>
        ) : saved ? (
          <>
            <p className="whitespace-pre-wrap text-[15px]">{saved}</p>
            <LinkButton variant="slate" href={`/obras/${id}/lectura`} className="self-start">
              <BookOpenText className="h-4 w-4" aria-hidden /> Modo lectura
            </LinkButton>
          </>
        ) : (
          <p className="text-[15px] text-text-2">Todavía no está escrito.</p>
        )}
      </CardBody>
    </Card>
  );
}
