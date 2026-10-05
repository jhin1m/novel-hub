import { users } from '@novel-hub/db';
import { DEFAULT_READER_SETTINGS, type ReaderSettings } from '@novel-hub/shared';
import { eq } from 'drizzle-orm';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getPreferences, updatePreferences } from './preferences';

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

const sepia: ReaderSettings = { ...DEFAULT_READER_SETTINGS, theme: 'sepia', updatedAt: 1000 };

async function stored(userId: string): Promise<unknown> {
  const [row] = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId));
  return row?.preferences;
}

describe('updatePreferences', () => {
  it('turning 18+ on without the adult confirmation is refused and changes nothing', async () => {
    const userId = await userWith({});
    expect(await updatePreferences(db, userId, { showMature: true })).toEqual({
      ok: false,
      error: 'ADULT_CONFIRMATION_REQUIRED',
    });
    expect(await updatePreferences(db, userId, { showMature: true, confirmAdult: false })).toEqual({
      ok: false,
      error: 'ADULT_CONFIRMATION_REQUIRED',
    });
    expect(await stored(userId)).toEqual({});
  });

  it('turns 18+ on with the confirmation; the confirmation itself is not stored', async () => {
    const userId = await userWith({});
    const result = await updatePreferences(db, userId, { showMature: true, confirmAdult: true });
    expect(result).toEqual({ ok: true, value: { showMature: true } });
    expect(await stored(userId)).toEqual({ showMature: true });
  });

  it('turning 18+ off needs no confirmation', async () => {
    const userId = await userWith({ showMature: true });
    expect(await updatePreferences(db, userId, { showMature: false })).toEqual({
      ok: true,
      value: { showMature: false },
    });
  });

  it('changing one field keeps the others', async () => {
    const userId = await userWith({ reader: sepia });
    await updatePreferences(db, userId, { showMature: true, confirmAdult: true });
    expect(await getPreferences(db, userId)).toEqual({ showMature: true, reader: sepia });

    const larger = { ...sepia, fontSize: 24, updatedAt: 2000 };
    await updatePreferences(db, userId, { reader: larger });
    expect(await getPreferences(db, userId)).toEqual({ showMature: true, reader: larger });
  });

  it('an update waits for a concurrent writer and keeps its change', async () => {
    const userId = await userWith({});
    // Another transaction holds the row, then writes a different field.
    const other = await pool.connect();
    try {
      await other.query('begin');
      await other.query('select preferences from users where id = $1 for update', [userId]);
      let settled = false;
      const pending = updatePreferences(db, userId, { reader: sepia }).finally(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(settled).toBe(false);
      await other.query(
        `update users set preferences = '{"showMature":true}'::jsonb where id = $1`,
        [userId],
      );
      await other.query('commit');
      await pending;
    } finally {
      other.release();
    }
    expect(await getPreferences(db, userId)).toEqual({ showMature: true, reader: sepia });
  });

  it('replaces a stored value that no longer parses', async () => {
    const userId = await userWith({ showMature: 'yes', reader: { theme: 'neon' } });
    await updatePreferences(db, userId, { reader: sepia });
    expect(await stored(userId)).toEqual({ showMature: false, reader: sepia });
  });
});
