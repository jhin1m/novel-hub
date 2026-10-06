import {
  type StoryActor,
  createChapter,
  createStory,
  publishChapter,
  saveDraft,
} from '@novel-hub/core';
import { users } from '@novel-hub/db';
import { createTestDb } from '@novel-hub/db/testing';
import { canonicalPath } from '@novel-hub/shared';

let counter = 0;

export interface PublishedStory {
  title: string;
  slug: string;
  publicId: string;
  /** Username of the author created for the story. */
  username: string;
  /** Canonical path of chapter `number`. */
  chapterPath: (number: number) => string;
}

/** The text of chapter `number`: 320 words, opening with a line that names the chapter. */
export function chapterText(number: number): string {
  const words = Array.from({ length: 316 }, (_, i) => `chữ${i}`).join(' ');
  return `Mở đầu chương ${number}. ${words}`;
}

/**
 * Creates an author and a story through `core`, straight in the test database: `published`
 * chapters are published, `drafts` are created after them and left unpublished.
 */
export async function createPublishedStory(
  opts: {
    title?: string;
    published?: number;
    drafts?: number;
    isMature?: boolean;
    warningTags?: string[];
    authorNote?: string;
    /** Paragraphs added after the opening one of every chapter. */
    extraParagraphs?: string[];
  } = {},
): Promise<PublishedStory> {
  counter += 1;
  const username = `a_${Date.now().toString(36)}${counter}`;
  const { db, pool } = createTestDb();
  try {
    const [row] = await db
      .insert(users)
      .values({
        username,
        displayName: 'Tác Giả Đọc',
        email: `${username}@example.com`,
        emailVerified: true,
      })
      .returning();
    if (!row) throw new Error('user insert failed');
    const author: StoryActor = {
      id: row.id,
      role: row.role,
      status: row.status,
      emailVerified: row.emailVerified,
    };
    const title = opts.title ?? 'Kiếm Đạo Độc Tôn';
    const story = await createStory(db, author, {
      title,
      synopsis: '',
      mainTag: 'tien-hiep',
      tags: opts.warningTags ?? [],
      isMature: opts.isMature ?? false,
      isAiAssisted: false,
    });
    if (!story.ok) throw new Error(story.error);
    const { publicId, slug } = story.value;

    const total = (opts.published ?? 1) + (opts.drafts ?? 0);
    for (let i = 1; i <= total; i += 1) {
      const created = await createChapter(db, author, publicId);
      if (!created.ok) throw new Error(created.error);
      const { number, draftUpdatedAt } = created.value;
      const saved = await saveDraft(db, author, publicId, number, {
        doc: {
          type: 'doc',
          content: [chapterText(number), ...(opts.extraParagraphs ?? [])].map((text) => ({
            type: 'paragraph',
            attrs: { pid: null },
            content: [{ type: 'text', text }],
          })),
        },
        baseUpdatedAt: draftUpdatedAt ?? '',
      });
      if (!saved.ok) throw new Error(saved.error);
      if (i > (opts.published ?? 1)) continue;
      const published = await publishChapter(db, author, publicId, number, {
        baseUpdatedAt: saved.value.updatedAt,
      });
      if (!published.ok) throw new Error(published.error);
    }

    if (opts.authorNote !== undefined) {
      await pool.query(
        `update chapters set author_note = $1
         where number = 1 and story_id = (select id from stories where public_id = $2)`,
        [opts.authorNote, publicId],
      );
    }

    return {
      title,
      slug,
      publicId,
      username,
      chapterPath: (number) => canonicalPath({ kind: 'chapter', slug, publicId, number }),
    };
  } finally {
    await pool.end();
  }
}

/** Turns on 18+ content for an account, as the settings page does. */
export async function allowMatureContent(email: string): Promise<void> {
  const { pool } = createTestDb();
  try {
    await pool.query(
      `update users set preferences = '{"showMature":true}'::jsonb where email = $1`,
      [email],
    );
  } finally {
    await pool.end();
  }
}
