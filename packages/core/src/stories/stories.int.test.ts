import { stories, storyTags, tags, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { isValidPublicId } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { UserRole } from '../policies/user';
import type { StoryActor } from '../policies/story';
import type { StoragePort } from '../storage/storage';
import { removeStoryCover, setStoryCover } from './cover';
import { createStory } from './create-story';
import { getAuthorStory, listAuthorStories, listTags } from './read-stories';
import { updateStory } from './update-story';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

async function makeUser(username: string, role: UserRole = 'reader'): Promise<StoryActor> {
  const [row] = await db
    .insert(users)
    .values({
      username,
      displayName: username,
      email: `${username}@example.com`,
      role,
      emailVerified: true,
    })
    .returning();
  if (!row) throw new Error('user insert failed');
  return { id: row.id, role: row.role, status: row.status, emailVerified: row.emailVerified };
}

async function roleOf(actor: StoryActor) {
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, actor.id));
  return row?.role;
}

const input = {
  title: 'Kiếm Đạo Độc Tôn',
  synopsis: 'Một đệ tử ngoại môn.',
  mainTag: 'tien-hiep',
  tags: ['he-thong'],
  isMature: false,
  isAiAssisted: true,
};

async function created(actor: StoryActor, overrides: Partial<typeof input> = {}) {
  const result = await createStory(db, actor, { ...input, ...overrides });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe('createStory', () => {
  it('creates a draft, ongoing story with slug, public id and tags (main tag included)', async () => {
    const author = await makeUser('tac_gia');
    const story = await created(author);
    expect(story).toMatchObject({
      slug: 'kiem-dao-doc-ton',
      title: 'Kiếm Đạo Độc Tôn',
      visibility: 'draft',
      status: 'ongoing',
      coverUrl: null,
      isAiAssisted: true,
      mainTag: { slug: 'tien-hiep', kind: 'genre' },
      tags: [{ slug: 'he-thong', name: 'Hệ thống', kind: 'theme' }],
      chapterCount: 0,
    });
    expect(isValidPublicId(story.publicId)).toBe(true);
    expect(story).not.toHaveProperty('id');
    expect(story).not.toHaveProperty('authorId');

    const [row] = await db.select().from(stories).where(eq(stories.publicId, story.publicId));
    const linked = await db
      .select({ slug: tags.slug })
      .from(storyTags)
      .innerJoin(tags, eq(tags.id, storyTags.tagId))
      .where(eq(storyTags.storyId, row?.id ?? ''));
    expect(linked.map((t) => t.slug).sort()).toEqual(['he-thong', 'tien-hiep']);
  });

  it('promotes a reader to author on the first story', async () => {
    const reader = await makeUser('doc_gia');
    await created(reader);
    expect(await roleOf(reader)).toBe('author');
  });

  it('keeps mod and admin roles', async () => {
    for (const role of ['mod', 'admin'] as const) {
      const user = await makeUser(`user_${role}`, role);
      await created(user);
      expect(await roleOf(user)).toBe(role);
    }
  });

  it('maps merged tags to the canonical tag and counts duplicates once', async () => {
    const author = await makeUser('tac_gia');
    const story = await created(author, { mainTag: 'tu-tien', tags: ['tien-hiep', 'tu-tien'] });
    expect(story.mainTag.slug).toBe('tien-hiep');
    expect(story.tags).toEqual([]);
  });

  it('rejects unknown tags, a non-genre main tag and more than ten tags', async () => {
    const author = await makeUser('tac_gia');
    const cases: [Partial<typeof input>, string][] = [
      [{ mainTag: 'khong-co' }, 'UNKNOWN_TAG'],
      [{ tags: ['khong-co'] }, 'UNKNOWN_TAG'],
      [{ mainTag: 'xuyen-khong' }, 'MAIN_TAG_NOT_GENRE'],
    ];
    for (const [overrides, error] of cases) {
      expect(await createStory(db, author, { ...input, ...overrides })).toEqual({
        ok: false,
        error,
      });
    }

    const extra = Array.from({ length: 10 }, (_, i) => `extra-${i}`);
    await db
      .insert(tags)
      .values(extra.map((slug) => ({ slug, name: slug, kind: 'theme' as const })));
    expect(await createStory(db, author, { ...input, tags: extra })).toEqual({
      ok: false,
      error: 'TOO_MANY_TAGS',
    });
    expect(await db.select().from(stories)).toHaveLength(0);
    expect(await roleOf(author)).toBe('reader');
  });
});

describe('updateStory', () => {
  it('regenerates the slug on a title change and reports the previous slug', async () => {
    const author = await makeUser('tac_gia');
    const story = await created(author);
    const result = await updateStory(db, author, story.publicId, { title: 'Kiếm Đạo Mới' });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.previousSlug).toBe('kiem-dao-doc-ton');
    expect(result.value.story).toMatchObject({
      publicId: story.publicId,
      slug: 'kiem-dao-moi',
      title: 'Kiếm Đạo Mới',
    });
  });

  it('leaves other fields untouched and reports no slug change', async () => {
    const author = await makeUser('tac_gia');
    const story = await created(author);
    const result = await updateStory(db, author, story.publicId, { status: 'completed' });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.previousSlug).toBeNull();
    expect(result.value.story).toMatchObject({
      status: 'completed',
      synopsis: story.synopsis,
      isAiAssisted: true,
      tags: story.tags,
    });
  });

  it('replaces the tag set', async () => {
    const author = await makeUser('tac_gia');
    const story = await created(author);
    const result = await updateStory(db, author, story.publicId, {
      mainTag: 'do-thi',
      tags: ['bao-luc', 'noi-dung-18'],
      isMature: true,
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.story.mainTag.slug).toBe('do-thi');
    expect(result.value.story.tags.map((t) => t.slug)).toEqual(['bao-luc', 'noi-dung-18']);
  });

  it('forbids other users and reports unknown stories', async () => {
    const author = await makeUser('tac_gia');
    const other = await makeUser('nguoi_khac', 'admin');
    const story = await created(author);
    expect(await updateStory(db, other, story.publicId, { title: 'Chiếm' })).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(await updateStory(db, author, 'zzzzzzzz', { title: 'Mới' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
    expect(await updateStory(db, author, 'not-a-public-id', { title: 'Mới' })).toEqual({
      ok: false,
      error: 'NOT_FOUND',
    });
  });

  it('rolls back when the new tags are invalid', async () => {
    const author = await makeUser('tac_gia');
    const story = await created(author);
    expect(
      await updateStory(db, author, story.publicId, {
        title: 'Khác',
        mainTag: 'he-thong',
        tags: [],
      }),
    ).toEqual({ ok: false, error: 'MAIN_TAG_NOT_GENRE' });
    const again = await getAuthorStory(db, author, story.publicId);
    expect(again.ok && again.value.title).toBe(story.title);
  });
});

describe('reading', () => {
  it('lists only my stories, most recently edited first', async () => {
    const author = await makeUser('tac_gia');
    const other = await makeUser('nguoi_khac');
    const first = await created(author, { title: 'Truyện Một' });
    await created(author, { title: 'Truyện Hai' });
    await created(other, { title: 'Truyện Người Khác' });
    await updateStory(db, author, first.publicId, { synopsis: 'Sửa lại' });

    const list = await listAuthorStories(db, author);
    expect(list.map((s) => s.title)).toEqual(['Truyện Một', 'Truyện Hai']);
  });

  it('getAuthorStory forbids reading someone else’s story', async () => {
    const author = await makeUser('tac_gia');
    const other = await makeUser('nguoi_khac');
    const story = await created(author);
    expect(await getAuthorStory(db, other, story.publicId)).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
  });

  it('listTags returns canonical tags ordered by kind then name', async () => {
    const list = await listTags(db);
    expect(list.some((t) => t.slug === 'tu-tien')).toBe(false);
    expect(list.map((t) => t.kind)).toEqual(
      [...list.map((t) => t.kind)].sort(
        (a, b) =>
          ['genre', 'theme', 'warning'].indexOf(a) - ['genre', 'theme', 'warning'].indexOf(b),
      ),
    );
    const genres = list.filter((t) => t.kind === 'genre').map((t) => t.name);
    expect(genres).toEqual([...genres].sort((a, b) => a.localeCompare(b, 'vi')));
    expect(list[0]).toEqual({
      slug: expect.any(String) as unknown,
      name: expect.any(String) as unknown,
      kind: 'genre',
    });
  });
});

describe('covers', () => {
  function memoryStorage() {
    const objects = new Map<string, { body: Uint8Array; cacheControl: string }>();
    const deleted: string[] = [];
    const storage: StoragePort = {
      put: (key, body, opts) => {
        objects.set(key, { body, cacheControl: opts.cacheControl });
        return Promise.resolve();
      },
      delete: (key) => {
        deleted.push(key);
        return Promise.resolve();
      },
      publicUrl: (key) => `https://cdn.test/${key}`,
    };
    return { storage, objects, deleted };
  }

  async function png(width: number, height: number, background = '#a8432a') {
    const buffer = await sharp({ create: { width, height, channels: 3, background } })
      .png()
      .toBuffer();
    return new Uint8Array(buffer);
  }

  it('stores two immutable variants and keeps the previous cover files', async () => {
    const author = await makeUser('tac_gia');
    const story = await created(author);
    const { storage, objects, deleted } = memoryStorage();

    const first = await setStoryCover({ db, storage }, author, story.publicId, await png(600, 900));
    if (!first.ok) throw new Error(first.error);
    const firstUrl = first.value.coverUrl ?? '';
    expect(firstUrl).toMatch(
      new RegExp(`^https://cdn\\.test/covers/${story.publicId}/[0-9a-f]{16}-600\\.webp$`),
    );
    expect([...objects.keys()].sort()).toEqual(
      [firstUrl, firstUrl.replace('-600.webp', '-300.webp')]
        .map((u) => u.replace('https://cdn.test/', ''))
        .sort(),
    );
    for (const object of objects.values()) {
      expect(object.cacheControl).toBe('public, max-age=31536000, immutable');
    }

    const second = await setStoryCover(
      { db, storage },
      author,
      story.publicId,
      await png(600, 900, '#1f6b66'),
    );
    if (!second.ok) throw new Error(second.error);
    expect(second.value.coverUrl).not.toBe(firstUrl);
    expect(objects.size).toBe(4);
    expect(deleted).toEqual([]);

    const removed = await removeStoryCover({ db }, author, story.publicId);
    expect(removed.ok && removed.value.coverUrl).toBeNull();
  });

  it('rejects other users and bad images without touching storage', async () => {
    const author = await makeUser('tac_gia');
    const other = await makeUser('nguoi_khac');
    const story = await created(author);
    const { storage, objects } = memoryStorage();
    expect(
      await setStoryCover({ db, storage }, other, story.publicId, await png(600, 900)),
    ).toEqual({
      ok: false,
      error: 'FORBIDDEN',
    });
    expect(
      await setStoryCover({ db, storage }, author, story.publicId, await png(500, 800)),
    ).toEqual({
      ok: false,
      error: 'IMAGE_TOO_SMALL',
    });
    expect(objects.size).toBe(0);
  });
});
