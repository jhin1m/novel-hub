import { type Db, type StoryRow, type Tx, storyTags, tags } from '@novel-hub/db';
import type { StoryStatus, StoryVisibility, TagKind } from '@novel-hub/shared';
import { eq, inArray } from 'drizzle-orm';

/** Public face of a tag: internal ids never leave the server, the slug identifies it. */
export interface TagView {
  slug: string;
  name: string;
  kind: TagKind;
}

/** A story as its author sees it in the writing area. No internal ids. */
export interface AuthorStoryView {
  publicId: string;
  slug: string;
  title: string;
  synopsis: string;
  coverUrl: string | null;
  mainTag: TagView;
  /** Tags besides the main one, ordered by kind then name. */
  tags: TagView[];
  status: StoryStatus;
  visibility: StoryVisibility;
  isMature: boolean;
  isAiAssisted: boolean;
  wordCount: number;
  chapterCount: number;
  lastChapterAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const KIND_ORDER: Record<TagKind, number> = { genre: 0, theme: 1, warning: 2 };

export function compareTags(a: TagView, b: TagView): number {
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name, 'vi');
}

/** Builds author views for several stories with one tag query. */
export async function toAuthorStoryViews(
  db: Db | Tx,
  rows: StoryRow[],
): Promise<AuthorStoryView[]> {
  if (rows.length === 0) return [];
  const storyIds = rows.map((r) => r.id);
  const mainTagIds = rows.map((r) => r.mainTagId);
  // Main tags are fetched by id as well: they are in `story_tags` too, but the view must not
  // depend on that.
  const [linked, mains] = await Promise.all([
    db
      .select({
        storyId: storyTags.storyId,
        id: tags.id,
        slug: tags.slug,
        name: tags.name,
        kind: tags.kind,
      })
      .from(storyTags)
      .innerJoin(tags, eq(tags.id, storyTags.tagId))
      .where(inArray(storyTags.storyId, storyIds)),
    db
      .select({ id: tags.id, slug: tags.slug, name: tags.name, kind: tags.kind })
      .from(tags)
      .where(inArray(tags.id, mainTagIds)),
  ]);
  const mainById = new Map(mains.map((t) => [t.id, t]));

  return rows.map((row) => {
    const main = mainById.get(row.mainTagId);
    if (!main) throw new Error('Story main tag is missing');
    const extra = linked
      .filter((t) => t.storyId === row.id && t.id !== row.mainTagId)
      .map(({ slug, name, kind }) => ({ slug, name, kind }))
      .sort(compareTags);
    return {
      publicId: row.publicId,
      slug: row.slug,
      title: row.title,
      synopsis: row.synopsis,
      coverUrl: row.coverUrl,
      mainTag: { slug: main.slug, name: main.name, kind: main.kind },
      tags: extra,
      status: row.status,
      visibility: row.visibility,
      isMature: row.isMature,
      isAiAssisted: row.isAiAssisted,
      wordCount: row.wordCount,
      chapterCount: row.chapterCount,
      lastChapterAt: row.lastChapterAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });
}

export async function toAuthorStoryView(db: Db | Tx, row: StoryRow): Promise<AuthorStoryView> {
  const [view] = await toAuthorStoryViews(db, [row]);
  if (!view) throw new Error('Story view was not built');
  return view;
}
