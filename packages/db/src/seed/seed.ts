import { createHash } from 'node:crypto';
import { countWords, generatePid, slugify } from '@novel-hub/shared';
import { inArray } from 'drizzle-orm';
import type { Db } from '../client';
import { accounts, users } from '../schema/auth';
import { chapterContents, chapterDrafts, chapters } from '../schema/chapters';
import { storyTags, tags } from '../schema/stories';
import { type Tx, insertStoryWithPublicId } from '../stories';
import { type ChapterFixture, type StoryFixture, STORIES, TAGS, USERS } from './fixtures';

export interface SeedOptions {
  /** Better Auth's hash function (passed in by phase 5). Goes together with `password`. */
  hashPassword?: (password: string) => Promise<string>;
  /** Shared password for every sample account. Goes together with `hashPassword`. */
  password?: string;
  /** Base timestamp for computing publish/schedule dates. Defaults to the run time. */
  now?: Date;
}

export interface SeedSummary {
  users: number;
  accounts: number;
  tags: number;
  stories: number;
  chapters: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Builds simple published chapter content: an editor doc and `<p data-pid>` HTML, with pids in
 * the same format the editor generates.
 */
function buildContent(paragraphs: string[]) {
  const paragraphIds = paragraphs.map(() => generatePid());
  const docJson = {
    type: 'doc',
    content: paragraphs.map((text, i) => ({
      type: 'paragraph',
      attrs: { pid: paragraphIds[i] },
      content: [{ type: 'text', text }],
    })),
  };
  const html = paragraphs
    .map((text, i) => `<p data-pid="${paragraphIds[i]}">${escapeHtml(text)}</p>`)
    .join('');
  const contentHash = createHash('sha256').update(html).digest('hex');
  return { docJson, html, paragraphIds, contentHash };
}

function lookup(map: Map<string, string>, key: string, kind: string): string {
  const id = map.get(key);
  if (id === undefined) throw new Error(`Fixture tham chiếu ${kind} không tồn tại: ${key}`);
  return id;
}

/** Publish date of the `index`-th published chapter out of `total`: one day apart, the newest is yesterday. */
function publishedAtFor(now: Date, index: number, total: number): Date {
  return new Date(now.getTime() - (total - index) * DAY_MS);
}

async function seedStory(
  tx: Tx,
  fixture: StoryFixture,
  ids: { users: Map<string, string>; tags: Map<string, string> },
  now: Date,
): Promise<number> {
  const published = fixture.chapters.filter((c) => c.status === 'published');
  const timeline = new Map<ChapterFixture, Date>(
    published.map((c, i) => [c, publishedAtFor(now, i, published.length)]),
  );
  const words = new Map(fixture.chapters.map((c) => [c, countWords(c.paragraphs.join(' '))]));
  const lastPublished = published.at(-1);

  // Counters only count published, non-soft-deleted chapters (the seed has no deleted chapters).
  const { id: storyId } = await insertStoryWithPublicId(tx, {
    slug: slugify(fixture.title),
    authorId: lookup(ids.users, fixture.authorUsername, 'user'),
    title: fixture.title,
    synopsis: fixture.synopsis,
    mainTagId: lookup(ids.tags, fixture.mainTagSlug, 'tag'),
    status: fixture.status,
    visibility: fixture.visibility,
    isAiAssisted: fixture.isAiAssisted,
    isMature: fixture.isMature,
    wordCount: published.reduce((sum, c) => sum + (words.get(c) ?? 0), 0),
    chapterCount: published.length,
    lastChapterAt: lastPublished ? (timeline.get(lastPublished) ?? null) : null,
  });

  const tagSlugs = new Set([fixture.mainTagSlug, ...fixture.tagSlugs]);
  await tx
    .insert(storyTags)
    .values([...tagSlugs].map((slug) => ({ storyId, tagId: lookup(ids.tags, slug, 'tag') })));

  for (const [i, chapter] of fixture.chapters.entries()) {
    const [row] = await tx
      .insert(chapters)
      .values({
        storyId,
        number: i + 1,
        title: chapter.title,
        authorNote: chapter.authorNote,
        wordCount: words.get(chapter) ?? 0,
        status: chapter.status,
        publishedAt: timeline.get(chapter) ?? null,
        scheduledAt: chapter.status === 'scheduled' ? new Date(now.getTime() + 2 * DAY_MS) : null,
      })
      .returning({ id: chapters.id });
    if (!row) throw new Error('Insert chương không trả về id');

    if (chapter.status === 'draft') {
      await tx
        .insert(chapterDrafts)
        .values({ chapterId: row.id, docJson: buildContent(chapter.paragraphs).docJson });
    } else {
      // Scheduled chapters get their HTML built at scheduling time and just wait for the publish time.
      await tx
        .insert(chapterContents)
        .values({ chapterId: row.id, ...buildContent(chapter.paragraphs) });
    }
  }
  return fixture.chapters.length;
}

/**
 * Inserts the starting tag list (canonical tags first, then merged ones pointing at them). Safe to
 * run repeatedly and in production: existing slugs are left untouched. Returns slug → id for every
 * fixture tag.
 */
export async function seedTags(db: Db | Tx): Promise<Map<string, string>> {
  const tagIds = new Map<string, string>();
  for (const merged of [false, true]) {
    const batch = TAGS.filter((t) => (t.canonicalSlug !== undefined) === merged);
    await db
      .insert(tags)
      .values(
        batch.map((t) => ({
          slug: t.slug,
          name: t.name,
          kind: t.kind,
          canonicalId: t.canonicalSlug ? lookup(tagIds, t.canonicalSlug, 'tag') : null,
        })),
      )
      .onConflictDoNothing({ target: tags.slug });
    const rows = await db
      .select({ id: tags.id, slug: tags.slug })
      .from(tags)
      .where(
        inArray(
          tags.slug,
          batch.map((t) => t.slug),
        ),
      );
    for (const r of rows) tagIds.set(r.slug, r.id);
  }
  return tagIds;
}

/**
 * Loads sample data in a single transaction. Refuses when `users` already has data; to reload,
 * TRUNCATE first (CLI `--reset`). Does not check the environment itself: call `assertSeedAllowed` first.
 */
export async function seedDatabase(db: Db, opts: SeedOptions = {}): Promise<SeedSummary> {
  if ((opts.hashPassword === undefined) !== (opts.password === undefined)) {
    throw new Error('hashPassword và password phải truyền cùng nhau');
  }
  const passwordHash =
    opts.hashPassword && opts.password ? await opts.hashPassword(opts.password) : undefined;
  const now = opts.now ?? new Date();

  return db.transaction(async (tx) => {
    const [existing] = await tx.select({ id: users.id }).from(users).limit(1);
    if (existing) {
      throw new Error('Từ chối seed: bảng users đã có dữ liệu (dùng --reset để nạp lại)');
    }

    const tagIds = await seedTags(tx);

    const userRows = await tx
      .insert(users)
      .values(USERS.map((u) => ({ ...u, emailVerified: true })))
      .returning({ id: users.id, username: users.username });
    const userIds = new Map(userRows.map((r) => [r.username, r.id]));

    let accountCount = 0;
    if (passwordHash !== undefined) {
      const rows = await tx
        .insert(accounts)
        .values(
          userRows.map((u) => ({
            userId: u.id,
            accountId: u.id,
            providerId: 'credential',
            password: passwordHash,
          })),
        )
        .returning({ id: accounts.id });
      accountCount = rows.length;
    }

    let chapterCount = 0;
    for (const story of STORIES) {
      chapterCount += await seedStory(tx, story, { users: userIds, tags: tagIds }, now);
    }

    return {
      users: userRows.length,
      accounts: accountCount,
      tags: tagIds.size,
      stories: STORIES.length,
      chapters: chapterCount,
    };
  });
}
