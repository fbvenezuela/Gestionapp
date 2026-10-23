'use client';

import { useState } from 'react';
import { saveSetting } from '@/lib/actions/settings';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/field';

type V = { appName: string; shortName: string; greeting: string; closings: string[]; hashtags: string[]; raw: Record<string, unknown> };

export function BrandForm({ value }: { value: V }) {
  const { run, pending } = useAction();
  const [f, setF] = useState({ ...value, closings: value.closings.join(' | '), hashtags: value.hashtags.join(' ') });
  return (
    <Card>
      <CardHeader title="Textos" />
      <CardBody className="flex flex-col gap-3">
        <Field label="Nombre de la plataforma" htmlFor="ba"><Input id="ba" value={f.appName} onChange={(e) => setF({ ...f, appName: e.target.value })} /></Field>
        <Field label="Nombre corto" htmlFor="bs"><Input id="bs" value={f.shortName} onChange={(e) => setF({ ...f, shortName: e.target.value })} /></Field>
        <Field label="Saludo con que abren los copies" htmlFor="bg"><Input id="bg" value={f.greeting} onChange={(e) => setF({ ...f, greeting: e.target.value })} /></Field>
        <Field label="Cierres (separados por |)" htmlFor="bc"><Input id="bc" value={f.closings} onChange={(e) => setF({ ...f, closings: e.target.value })} /></Field>
        <Field label="Hashtags base" htmlFor="bh"><Input id="bh" value={f.hashtags} onChange={(e) => setF({ ...f, hashtags: e.target.value })} /></Field>
        <p className="text-sm text-text-2">El nombre en el menú y los correos sale del archivo del cliente; estos textos los usan los copies.</p>
        <Button disabled={pending} onClick={() => run(() => saveSetting({ key: 'brand', value: { ...f.raw, appName: f.appName, shortName: f.shortName, greeting: f.greeting, closings: f.closings.split('|').map((x) => x.trim()).filter(Boolean), hashtags: f.hashtags.split(/\s+/).filter(Boolean) } }), { success: 'Guardado.' })}>Guardar</Button>
      </CardBody>
    </Card>
  );
}
