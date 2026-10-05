import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { stories, tags, users } from './schema/index';
import { insertStoryWithPublicId } from './stories';
import { createTestDb, truncateAll } from './testing/index';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
});

async function storyValues() {
  const [user] = await db
    .insert(users)
    .values({ username: 'tac_gia', displayName: 'Tác giả', email: 'a@example.com' })
    .returning({ id: users.id });
  const [tag] = await db
    .insert(tags)
    .values({ slug: 'tien-hiep', name: 'Tiên hiệp', kind: 'genre' })
    .returning({ id: tags.id });
  if (!user || !tag) throw new Error('fixture insert failed');
  return { slug: 'truyen', title: 'Truyện', authorId: user.id, mainTagId: tag.id };
}

describe('insertStoryWithPublicId', () => {
  it('regenerates the public id after a collision and inserts once', async () => {
    const values = await storyValues();
    await insertStoryWithPublicId(db, values, () => 'aaaaaaaa');

    const ids = ['aaaaaaaa', 'aaaaaaaa', 'bbbbbbbb'];
    const row = await db.transaction((tx) =>
      insertStoryWithPublicId(tx, values, () => ids.shift() ?? 'zzzzzzzz'),
    );
    expect(row.publicId).toBe('bbbbbbbb');
    expect(await db.select().from(stories).where(eq(stories.publicId, 'bbbbbbbb'))).toHaveLength(1);
    expect(await db.select().from(stories)).toHaveLength(2);
  });

  it('gives up after five collisions', async () => {
    const values = await storyValues();
    await insertStoryWithPublicId(db, values, () => 'aaaaaaaa');
    await expect(insertStoryWithPublicId(db, values, () => 'aaaaaaaa')).rejects.toThrow(
      /unique public_id/,
    );
  });
});
