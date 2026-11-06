'use client';

import { createContext, useContext } from 'react';
import type { MediaInfo, Municipality, RefOption } from '@/lib/data/web-admin';

// What every form of the website's editor may need besides its own piece of the draft: the library's files the draft
// names (and the ones chosen or uploaded meanwhile), the municipalities, the items a page's blocks can point at, whether
// the person may write, and the time zone. Provided once by the editor (editor.tsx).

export type EditorCtx = {
  media: Record<string, MediaInfo>;
  addMedia: (m: MediaInfo) => void;
  munis: Municipality[];
  refs: RefOption[];
  readOnly: boolean;
  tz: string;
};

export const EditorContext = createContext<EditorCtx | null>(null);

export function useEditor(): EditorCtx {
  const c = useContext(EditorContext);
  if (!c) throw new Error('useEditor fuera del editor');
  return c;
}
