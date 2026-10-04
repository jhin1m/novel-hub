import { createHash } from 'node:crypto';
import { generatePublicId, slugify } from '@novel-hub/shared';
import type { Db } from '../client';
import { accounts, users } from '../schema/auth';
import { chapterContents, chapterDrafts, chapters } from '../schema/chapters';
import { stories, storyTags, tags } from '../schema/stories';
import { type ChapterFixture, type StoryFixture, STORIES, TAGS, USERS } from './fixtures';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface SeedOptions {
  /** Hàm hash của Better Auth (phase 5 truyền vào). Đi cùng `password`. */
  hashPassword?: (password: string) => Promise<string>;
  /** Mật khẩu chung cho mọi tài khoản mẫu. Đi cùng `hashPassword`. */
  password?: string;
  /** Mốc thời gian gốc để tính ngày đăng/hẹn giờ. Mặc định thời điểm chạy. */
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
const PUBLIC_ID_ATTEMPTS = 5;

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * Dựng nội dung chương đã đăng dạng đơn giản: doc kiểu Tiptap và HTML `<p data-pid>`.
 * Pipeline sanitize thật có ở Giai đoạn 1.
 */
function buildContent(paragraphs: string[]) {
  const paragraphIds = paragraphs.map((_, i) => `p${i + 1}`);
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

/** Sinh `public_id`; trùng (unique `stories_public_id_key`) thì sinh lại, tối đa 5 lần. */
async function insertStory(
  tx: Tx,
  values: Omit<typeof stories.$inferInsert, 'publicId'>,
): Promise<string> {
  for (let attempt = 0; attempt < PUBLIC_ID_ATTEMPTS; attempt++) {
    const [row] = await tx
      .insert(stories)
      .values({ ...values, publicId: generatePublicId() })
      .onConflictDoNothing({ target: stories.publicId })
      .returning({ id: stories.id });
    if (row) return row.id;
  }
  throw new Error(`Không sinh được public_id duy nhất sau ${PUBLIC_ID_ATTEMPTS} lần`);
}

function lookup(map: Map<string, string>, key: string, kind: string): string {
  const id = map.get(key);
  if (id === undefined) throw new Error(`Fixture tham chiếu ${kind} không tồn tại: ${key}`);
  return id;
}

/** Ngày đăng của chương published thứ `index` trong `total` chương: cách nhau 1 ngày, mới nhất là hôm qua. */
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

  // Bộ đếm chỉ tính chương đã đăng và chưa xoá mềm (seed không có chương xoá).
  const storyId = await insertStory(tx, {
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
      // Chương hẹn giờ đã dựng sẵn HTML lúc hẹn, chỉ chờ tới giờ đăng.
      await tx
        .insert(chapterContents)
        .values({ chapterId: row.id, ...buildContent(chapter.paragraphs) });
    }
  }
  return fixture.chapters.length;
}

/**
 * Nạp dữ liệu mẫu trong một transaction. Từ chối khi `users` đã có dữ liệu; muốn nạp lại
 * thì TRUNCATE trước (CLI `--reset`). Không tự kiểm tra môi trường: gọi `assertSeedAllowed` trước.
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

    const tagIds = new Map<string, string>();
    // Tag chuẩn trước, tag trùng sau để có `canonical_id`.
    for (const pass of [false, true]) {
      const batch = TAGS.filter((t) => (t.canonicalSlug !== undefined) === pass);
      const rows = await tx
        .insert(tags)
        .values(
          batch.map((t) => ({
            slug: t.slug,
            name: t.name,
            kind: t.kind,
            canonicalId: t.canonicalSlug ? lookup(tagIds, t.canonicalSlug, 'tag') : null,
          })),
        )
        .returning({ id: tags.id, slug: tags.slug });
      for (const r of rows) tagIds.set(r.slug, r.id);
    }

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
