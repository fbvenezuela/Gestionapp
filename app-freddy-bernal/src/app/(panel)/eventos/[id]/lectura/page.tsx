import { notFound } from 'next/navigation';
import { requireSession, db } from '@/lib/auth/session';
import { getEvent, linkedFicha } from '@/lib/data/events';
import { beforeSpeaking, readingParts } from '@/lib/domain/ficha-tab';
import { Teleprompter } from './teleprompter';

export const metadata = { title: 'Modo lectura' };

// «Lo que voy a decir», big, for the boss's iPad: the storyboard's speech and the blocks' lines. An event born from an
// obra ficha with no speech written yet reads the ficha's FAB dialog instead (§4.1). «Antes de hablar» (who reported
// it, the liaison, what the boss should know) shows ONLY when the database returned the ficha's private part: the
// boss, despacho and administración with 2FA; for anyone else nothing of it reaches the page.
export default async function ReadingMode({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  const contacts = s.roles.some((r) => r === 'admin' || r === 'boss' || r === 'dispatch');
  const data = await db(s, async (sql) => {
    const ev = await getEvent(sql, id);
    if (!ev) return null;
    return { ev, ficha: await linkedFicha(sql, ev, { contacts, media: false }) };
  });
  if (!data) notFound();
  const { ev, ficha } = data;
  const { parts, fromFicha } = readingParts(ev.storyboard?.speech, ev.blocks.map((b) => b.boss_line), ficha?.fab);
  const before = contacts && ficha ? beforeSpeaking(ficha.kind, ficha.priv) : [];
  return (
    <Teleprompter
      title={ev.title}
      backHref={`/eventos/${ev.id}?tab=storyboard`}
      parts={parts}
      before={before}
      source={fromFicha && ficha ? `De la ficha de obra ${ficha.code}: «Lo que voy a decir» (diálogo FAB).` : undefined}
    />
  );
}
