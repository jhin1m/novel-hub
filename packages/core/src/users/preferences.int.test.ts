import { users } from '@novel-hub/db';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPreferences } from './preferences';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
});

async function userWith(preferences: Record<string, unknown>): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ username: 'reader', displayName: 'Reader', email: 'r@example.com', preferences })
    .returning();
  if (!row) throw new Error('user insert failed');
  return row.id;
}

describe('getPreferences', () => {
  it('fills defaults for an empty value', async () => {
    expect(await getPreferences(db, await userWith({}))).toEqual({ showMature: false });
  });

  it('returns stored values', async () => {
    expect(await getPreferences(db, await userWith({ showMature: true }))).toEqual({
      showMature: true,
    });
  });

  it('falls back to defaults when the stored value no longer matches the schema', async () => {
    expect(await getPreferences(db, await userWith({ showMature: 'yes' }))).toEqual({
      showMature: false,
    });
  });
});
