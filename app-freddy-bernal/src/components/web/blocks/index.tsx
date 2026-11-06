import type { Block } from '@/lib/web/blocks';
import type { FrozenMedia } from '@/lib/web/public';
import type { Site } from '@/lib/web/site-settings';
import { AttendedBlock, ChannelsBlock, DocumentsBlock, FaqBlock, IndicatorsBlock, NewsBlock, NoticesBlock, ParticipationBlock, ProjectsBlock, VideoBlock } from './data';
import { CtaBlock, GalleryBlock, HeroBlock, ImageBlock, TextBlock } from './simple';
import type { BlockContext } from './types';

export type { BlockContext, BlockData } from './types';

// The renderer of the website's pages (design §3): each visible block in its order, every block type of
// src/lib/web/blocks.ts with its own component. A hero that opens the page is the page's h1 (the page then draws no
// other h1); every other block title is an h2. Blocks never receive HTML: their data was checked by the schema when the
// item was published and read (public.ts), text is escaped by React and links pass safeHref.

export function BlockView({ block, ctx }: { block: Block; ctx: BlockContext }) {
  switch (block.type) {
    case 'hero':
      return <HeroBlock data={block.data} ctx={ctx} />;
    case 'text':
      return <TextBlock data={block.data} ctx={ctx} />;
    case 'image':
      return <ImageBlock data={block.data} ctx={ctx} />;
    case 'gallery':
      return <GalleryBlock data={block.data} ctx={ctx} />;
    case 'video':
      return <VideoBlock data={block.data} ctx={ctx} />;
    case 'documents':
      return <DocumentsBlock data={block.data} ctx={ctx} />;
    case 'faq':
      return <FaqBlock data={block.data} ctx={ctx} />;
    case 'indicators':
      return <IndicatorsBlock data={block.data} ctx={ctx} />;
    case 'projects':
      return <ProjectsBlock data={block.data} ctx={ctx} />;
    case 'news':
      return <NewsBlock data={block.data} ctx={ctx} />;
    case 'cta':
      return <CtaBlock data={block.data} ctx={ctx} />;
    case 'notices':
      return <NoticesBlock data={block.data} ctx={ctx} />;
    case 'channels':
      return <ChannelsBlock data={block.data} ctx={ctx} />;
    case 'participation':
      return <ParticipationBlock data={block.data} ctx={ctx} />;
    case 'attended':
      return <AttendedBlock data={block.data} ctx={ctx} />;
    default:
      return null;
  }
}

/** Whether the page's first visible block is a hero (it then carries the page's h1). */
export function opensWithHero(blocks: Block[]): boolean {
  return blocks.find((b) => b.visible)?.type === 'hero';
}

export function Blocks({ blocks, site, media, h1FromHero = true }: { blocks: Block[]; site: Site; media: Record<string, FrozenMedia>; h1FromHero?: boolean }) {
  const visible = blocks.filter((b) => b.visible);
  return (
    <>
      {visible.map((block, i) => (
        <BlockView
          key={block.id}
          block={block}
          ctx={{ site, media, first: i === 0, heading: h1FromHero && i === 0 && block.type === 'hero' ? 'h1' : 'h2' }}
        />
      ))}
    </>
  );
}
