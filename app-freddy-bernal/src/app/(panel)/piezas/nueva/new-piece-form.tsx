'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPiece } from '@/lib/actions/pieces';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { CategorySelect } from '@/components/ui/category-select';
import type { CategoryOption } from '@/lib/data/common';
import { PIECE_KIND } from '@/lib/data/labels';

export function NewPieceForm({ categories, events, eventId }: { categories: CategoryOption[]; events: { id: string; title: string; category_id: string | null }[]; eventId: string }) {
  const router = useRouter();
  const { run, pending } = useAction();
  const ev = events.find((e) => e.id === eventId);
  const [f, setF] = useState({ eventId, kind: 'video', title: ev?.title ?? '', categoryId: ev?.category_id ?? '' });
  return (
    <Card>
      <CardBody>
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => createPiece(f), { refresh: false, onOk: (r) => r.ok && router.push(`/piezas/${r.data!.id}`) });
          }}
        >
          <Field label="Evento" htmlFor="pe" className="sm:col-span-2">
            <Select id="pe" value={f.eventId} onChange={(e) => {
              const x = events.find((y) => y.id === e.target.value);
              setF({ ...f, eventId: e.target.value, title: f.title || x?.title || '', categoryId: f.categoryId || x?.category_id || '' });
            }}>
              <option value="">Sin evento</option>
              {events.map((x) => <option key={x.id} value={x.id}>{x.title}</option>)}
            </Select>
          </Field>
          <Field label="Tipo" htmlFor="pk">
            <Select id="pk" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
              {Object.entries(PIECE_KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Categoría" htmlFor="pc">
            <CategorySelect id="pc" categories={categories} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })} />
          </Field>
          <Field label="Título" htmlFor="pt" className="sm:col-span-2">
            <Input id="pt" required maxLength={140} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" size="lg" disabled={pending}>Crear pieza</Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
