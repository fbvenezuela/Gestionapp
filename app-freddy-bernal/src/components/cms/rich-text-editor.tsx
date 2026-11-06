'use client';

import { useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Bold, Italic, Link2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Select, Textarea } from '@/components/ui/field';
import { RichText } from '@/components/web/rich-text';
import { safeHref, type TextNode } from '@/lib/web/blocks';
import { EDIT_TYPES, editToNodes, markupToRuns, nodesToEdit, type EditNode, type EditType } from '@/lib/web/cms/markup';
import { cn } from '@/lib/cn';

// The website's safe rich text (design §3): one box per piece — paragraph, title, subtitle, list, quote or «por
// completar» —, and inside a paragraph or a list the toolbar puts **negrita**, *cursiva* and [enlaces](https://…). It
// is stored as structured text (never HTML) and drawn by the site's own renderer; «Así se ve» shows it here with the
// same renderer. Links only to https, http, mailto or a page of this site. Keyboard: every control is a real button.

const hasInline = (t: EditType) => t === 'paragraph' || t === 'list' || t === 'olist';

function badLinks(text: string): string[] {
  return markupToRuns(text)
    .filter((r) => r.href && !safeHref.safeParse(r.href).success)
    .map((r) => r.href!);
}

export function RichTextEditor({ label, hint, value, onChange, readOnly, required }: { label: string; hint?: string; value: unknown; onChange: (nodes: TextNode[]) => void; readOnly?: boolean; required?: boolean }) {
  const id = useId();
  const [edits, setEdits] = useState<EditNode[]>(() => {
    const start = nodesToEdit(value);
    return start.length ? start : [{ type: 'paragraph', text: '' }];
  });
  const areas = useRef(new Map<number, HTMLTextAreaElement>());
  const [linkFor, setLinkFor] = useState<number | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [say, setSay] = useState('');

  const commit = (next: EditNode[]) => {
    setEdits(next);
    onChange(editToNodes(next));
  };
  const patch = (i: number, p: Partial<EditNode>) => commit(edits.map((e, j) => (j === i ? { ...e, ...p } : e)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...edits];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    commit(next);
    setSay(`Movido a la posición ${i + d + 1} de ${next.length}.`);
  };
  const add = (type: EditType, at = edits.length) => {
    const next = [...edits];
    next.splice(at, 0, { type, text: '' });
    commit(next);
    setSay(`${EDIT_TYPES[type]} agregado.`);
    requestAnimationFrame(() => areas.current.get(at)?.focus());
  };

  /** Puts `before`/`after` around the selected words of box `i` (or a placeholder when nothing is selected). */
  const wrap = (i: number, before: string, after: string, placeholder: string) => {
    const el = areas.current.get(i);
    const text = edits[i].text;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const inner = text.slice(start, end) || placeholder;
    const next = text.slice(0, start) + before + inner + after + text.slice(end);
    patch(i, { text: next });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + inner.length);
    });
  };

  const applyLink = (i: number) => {
    const url = linkUrl.trim();
    if (!safeHref.safeParse(url).success) {
      setLinkError('El enlace va a una página (https://…), a un correo (mailto:…) o a una dirección de esta web (/…).');
      return;
    }
    wrap(i, '[', `](${url.replace(/\)/g, '%29')})`, 'texto del enlace');
    setLinkFor(null);
    setLinkUrl('');
    setLinkError(null);
  };

  const nodes = editToNodes(edits);

  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={`${id}-hint`}>
      <legend className="text-sm font-semibold">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </legend>
      <p id={`${id}-hint`} className="-mt-1 text-sm text-text-2">
        {hint ? `${hint} ` : ''}Negrita: <code>**así**</code> · cursiva: <code>*así*</code> · enlace: <code>[texto](https://…)</code>. Los botones lo escriben por ti.
      </p>
      <p className="sr-only" aria-live="polite">
        {say}
      </p>
      <ol className="flex flex-col gap-3">
        {edits.map((e, i) => {
          const bad = hasInline(e.type) ? badLinks(e.text) : [];
          return (
            <li key={i} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  aria-label={`Tipo de la parte ${i + 1}`}
                  value={e.type}
                  onChange={(ev) => patch(i, { type: ev.target.value as EditType })}
                  disabled={readOnly}
                  className="min-h-10 w-auto py-1.5 text-[15px]"
                >
                  {Object.entries(EDIT_TYPES).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
                {hasInline(e.type) && !readOnly ? (
                  <span className="flex gap-1" role="group" aria-label={`Formato de la parte ${i + 1}`}>
                    <Button type="button" size="sm" variant="secondary" onClick={() => wrap(i, '**', '**', 'texto en negrita')} aria-label="Negrita">
                      <Bold className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => wrap(i, '*', '*', 'texto en cursiva')} aria-label="Cursiva">
                      <Italic className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setLinkFor(linkFor === i ? null : i);
                        setLinkError(null);
                      }}
                      aria-expanded={linkFor === i}
                      aria-label="Enlace"
                    >
                      <Link2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </span>
                ) : null}
                {!readOnly ? (
                  <span className="ml-auto flex gap-1">
                    <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir la parte ${i + 1}`}>
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === edits.length - 1} aria-label={`Bajar la parte ${i + 1}`}>
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        commit(edits.filter((_, j) => j !== i));
                        setSay(`Parte ${i + 1} quitada.`);
                      }}
                      aria-label={`Quitar la parte ${i + 1}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </span>
                ) : null}
              </div>
              {linkFor === i ? (
                <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-surface-2 p-2 sm:flex-row sm:items-start">
                  <label className="flex flex-1 flex-col gap-1 text-sm font-semibold">
                    Dirección del enlace
                    <Input
                      value={linkUrl}
                      onChange={(ev) => setLinkUrl(ev.target.value)}
                      placeholder="https://… o /gestion"
                      inputMode="url"
                      aria-invalid={!!linkError || undefined}
                      onKeyDown={(ev) => {
                        if (ev.key === 'Enter') {
                          ev.preventDefault();
                          applyLink(i);
                        }
                      }}
                    />
                    {linkError ? (
                      <span className="font-medium text-danger" role="alert">
                        {linkError}
                      </span>
                    ) : (
                      <span className="font-normal text-text-2">Selecciona antes las palabras que llevan el enlace.</span>
                    )}
                  </label>
                  <Button type="button" size="sm" onClick={() => applyLink(i)} className="sm:mt-6">
                    Poner el enlace
                  </Button>
                </div>
              ) : null}
              <Textarea
                ref={(el) => {
                  if (el) areas.current.set(i, el);
                  else areas.current.delete(i);
                }}
                aria-label={`${EDIT_TYPES[e.type]} (parte ${i + 1})`}
                rows={e.type === 'h2' || e.type === 'h3' ? 1 : e.type === 'paragraph' ? 4 : 3}
                value={e.text}
                readOnly={readOnly}
                onChange={(ev) => patch(i, { text: ev.target.value })}
                placeholder={e.type === 'list' || e.type === 'olist' ? 'Un punto por línea' : e.type === 'pending' ? 'Lo que falta escribir' : ''}
                className={cn('min-h-0', (e.type === 'h2' || e.type === 'h3') && 'font-semibold')}
              />
              {e.type === 'quote' ? (
                <Input aria-label={`Quién lo dijo (parte ${i + 1})`} placeholder="Quién lo dijo (opcional)" value={e.cite ?? ''} readOnly={readOnly} onChange={(ev) => patch(i, { cite: ev.target.value })} />
              ) : null}
              {bad.length ? (
                <p className="text-sm font-medium text-danger" role="alert">
                  Este enlace no se puede usar: {bad.join(', ')}. Usa https://…, mailto:… o una dirección de esta web.
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {!readOnly ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Agregar a ${label.toLowerCase()}`}>
          {(['paragraph', 'h2', 'list', 'quote', 'pending'] as EditType[]).map((t) => (
            <Button key={t} type="button" size="sm" variant="secondary" onClick={() => add(t)}>
              <Plus className="h-4 w-4" aria-hidden /> {EDIT_TYPES[t]}
            </Button>
          ))}
        </div>
      ) : null}
      <details className="rounded-[var(--radius-control)] border border-border bg-surface">
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold">Así se ve en la web</summary>
        <div className="border-t border-border bg-ivory p-4 text-text">{nodes.length ? <RichText nodes={nodes} /> : <p className="text-sm text-text-2">Todavía no hay texto.</p>}</div>
      </details>
    </fieldset>
  );
}
