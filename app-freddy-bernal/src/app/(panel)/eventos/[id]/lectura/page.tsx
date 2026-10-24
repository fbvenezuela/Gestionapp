import { notFound, redirect } from 'next/navigation';
import { requireSession, db } from '@/lib/auth/session';
import { getEvent } from '@/lib/data/events';
import { Teleprompter } from './teleprompter';

export const metadata = { title: 'Modo lectura' };

export default async function ReadingMode({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireSession();
  const { id } = await params;
  // Secretaría only proposes: the storyboard is not her work (no tab, no reading mode).
  if (s.roles.includes('secretary') && !s.roles.some((r) => r !== 'secretary')) redirect(`/eventos/${id}`);
  const ev = await db(s, (sql) => getEvent(sql, id));
  if (!ev) notFound();
  const parts = [ev.storyboard?.speech ?? '', ...ev.blocks.map((b) => b.boss_line)].map((t) => t.trim()).filter(Boolean);
  return <Teleprompter title={ev.title} backHref={`/eventos/${ev.id}?tab=storyboard`} parts={parts} />;
}
