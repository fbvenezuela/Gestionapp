import type { Block, BlockType } from '@/lib/web/blocks';
import type { FrozenMedia } from '@/lib/web/public';
import type { Site } from '@/lib/web/site-settings';

/** The data of one kind of block, as the schema checked it. */
export type BlockData<T extends BlockType> = Extract<Block, { type: T }>['data'];

/** What every block may need besides its own data. */
export type BlockContext = {
  site: Site;
  /** The photos and files the page froze when it was published (web_items.published_media). */
  media: Record<string, FrozenMedia>;
  /** The level of the block's title: a hero that opens the page is its h1; every other block title is an h2. */
  heading: 'h1' | 'h2';
  /** The first block of the page (its photo loads first). */
  first: boolean;
  /** The administrator's preview: what is still missing (a photo, a video, a file, a «por completar» text) shows as its
   * placeholder so editors see it. Never on the public site, where a missing piece simply draws nothing. */
  preview?: boolean;
};
