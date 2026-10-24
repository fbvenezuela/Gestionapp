'use client';

import { useRef } from 'react';
import { FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { importMetricsCsv } from '@/lib/actions/results';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';

export function CsvImport() {
  const { run, pending } = useAction();
  const ref = useRef<HTMLInputElement>(null);
  return (
    <Card>
      <CardHeader title="Cargar resultados desde un archivo (CSV)" subtitle="Columnas: link, vistas, alcance, me_gusta, comentarios, compartidos, guardados." />
      <CardBody>
        <input ref={ref} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Archivo CSV" onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const csv = await f.text();
          run(() => importMetricsCsv({ csv }), {
            onOk: (r) => {
              if (!r.ok) return;
              toast.success(`Se cargaron ${r.data!.matched} ${r.data!.matched === 1 ? 'publicación' : 'publicaciones'}.`);
              if (r.data!.unmatchedCount) toast.warning(r.data!.unmatchedCount === 1 ? '1 link no coincide con ninguna publicación.' : `${r.data!.unmatchedCount} links no coinciden con ninguna publicación.`);
            },
          });
          e.target.value = '';
        }} />
        <Button variant="secondary" disabled={pending} onClick={() => ref.current?.click()}><FileUp className="h-4 w-4" aria-hidden /> Elegir archivo CSV</Button>
      </CardBody>
    </Card>
  );
}
