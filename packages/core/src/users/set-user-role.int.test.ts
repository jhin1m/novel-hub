import { users } from '@novel-hub/db';
import { createTestDb, truncateAll } from '@novel-hub/db/testing';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setUserRole } from './set-user-role';

const { db, pool } = createTestDb();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(db);
});

async function createUser(username: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ username, displayName: username, email: `${username}@example.com` })
    .returning();
  if (!row) throw new Error('user insert failed');
  return row.id;
}

async function readUser(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id));
  if (!row) throw new Error('user missing');
  return row;
}

describe('setUserRole', () => {
  it('promotes a reader to mod and reports the previous role', async () => {
    const id = await createUser('alice');
    const result = await setUserRole(db, { username: 'alice', role: 'mod' });
    expect(result).toEqual({
      ok: true,
      value: { id, username: 'alice', previousRole: 'reader', role: 'mod' },
    });
    expect((await readUser(id)).role).toBe('mod');
  });

  it('promotes a mod to admin', async () => {
    const id = await createUser('bob');
    await setUserRole(db, { username: 'bob', role: 'mod' });
    const result = await setUserRole(db, { username: 'bob', role: 'admin' });
    expect(result).toMatchObject({ ok: true, value: { previousRole: 'mod', role: 'admin' } });
    expect((await readUser(id)).role).toBe('admin');
  });

  it('does not change the account status', async () => {
    const id = await createUser('carol');
    await db.update(users).set({ status: 'muted' }).where(eq(users.id, id));
    await setUserRole(db, { username: 'carol', role: 'mod' });
    expect((await readUser(id)).status).toBe('muted');
  });

  it('returns USER_NOT_FOUND for an unknown username and changes nobody', async () => {
    const id = await createUser('dave');
    const result = await setUserRole(db, { username: 'nobody', role: 'admin' });
    expect(result).toEqual({ ok: false, error: 'USER_NOT_FOUND' });
    expect((await readUser(id)).role).toBe('reader');
  });
});
