import { type CdnPurger, createStory } from '@novel-hub/core';
import { stories, users } from '@novel-hub/db';
import { seedTags } from '@novel-hub/db/seed';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { routeContentJob } from '../content-router';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
  await seedTags(db);
});

describe('purge-urls job (real Postgres, fake CDN)', () => {
  it('purges the canonical URLs resolved from the current state', async () => {
    const [user] = await db
      .insert(users)
      .values({
        username: 'tac_gia',
        displayName: 'T',
        email: 't@example.com',
        emailVerified: true,
      })
      .returning();
    if (!user) throw new Error('user insert failed');
    const actor = { id: user.id, role: user.role, status: user.status, emailVerified: true };
    const created = await createStory(db, actor, {
      title: 'Truyện Purge',
      synopsis: '',
      mainTag: 'tien-hiep',
      tags: [],
      isMature: false,
      isAiAssisted: false,
    });
    if (!created.ok) throw new Error(created.error);
    // The only story in the database.
    const [story] = await db.select().from(stories);
    if (!story) throw new Error('story missing');

    const purge = vi.fn<CdnPurger['purge']>(() => Promise.resolve());
    await routeContentJob(
      {
        name: 'purge-urls',
        data: { entity: 'user', action: 'updated', userId: user.id },
      },
      { db, cdn: { purge }, appUrl: 'https://truyen.example' },
    );
    expect(purge).toHaveBeenCalledWith([
      'https://truyen.example/authors/tac_gia',
      `https://truyen.example/stories/${story.slug}-${story.publicId}`,
    ]);
  });
});
