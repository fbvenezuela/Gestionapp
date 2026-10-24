'use client';

import { useState } from 'react';
import { BookmarkCheck, PenLine } from 'lucide-react';
import { saveAnswerAsExample } from '@/lib/actions/assistant';
import { useAction } from '@/lib/hooks/use-action';
import { Button } from '@/components/ui/button';
import { correctionDraft } from '@/components/assistant/panel-core';
import { ScriptEditor } from './editors';

// Under each real answer in «Conversaciones»: «Así se contesta» keeps it as an example script;
// «Corregir» opens the editor with the question in place to write how it should have answered.
// Both are marked «de una conversación real».
export function AnswerActions({ conversationId, messageId, question, canKeep }: { conversationId: string; messageId: string; question: string; canKeep: boolean }) {
  const { run, pending } = useAction();
  const [fixing, setFixing] = useState(false);
  if (!question.trim()) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {canKeep ? (
        <Button
          variant="secondary"
          disabled={pending}
          onClick={() => run(() => saveAnswerAsExample({ conversationId, messageId }), { success: 'Guardado como ejemplo en «Cómo contesta».' })}
        >
          <BookmarkCheck className="h-4 w-4" aria-hidden /> Así se contesta
        </Button>
      ) : null}
      <Button variant="ghost" onClick={() => setFixing(true)}>
        <PenLine className="h-4 w-4" aria-hidden /> Corregir
      </Button>
      {fixing ? (
        <ScriptEditor
          open
          onOpenChange={setFixing}
          fromConversation
          heading="Cómo debería haber contestado"
          initial={{ ...correctionDraft(question), notes: 'Corrección de una conversación real.', always: false, roles: [], active: true }}
        />
      ) : null}
    </div>
  );
}
