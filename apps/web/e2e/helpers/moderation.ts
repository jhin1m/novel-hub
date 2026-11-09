import { createTestDb } from '@novel-hub/db/testing';
import { previousVnMonth, statsDate } from '@novel-hub/shared';

async function query(sql: string, params: unknown[]): Promise<void> {
  const { pool } = createTestDb();
  try {
    await pool.query(sql, params);
  } finally {
    await pool.end();
  }
}

/** Gives the account the moderator role in the test database. */
export async function makeModerator(email: string): Promise<void> {
  await query("update users set role = 'mod' where email = $1", [email]);
}

/** An open spam report on the account, filed by the system (no reporter) like an automatic one. */
export async function reportAccount(username: string): Promise<void> {
  await query(
    `insert into reports (target_type, target_id, reason)
     select 'user', id, 'spam' from users where username = $1`,
    [username],
  );
}

/** Earlier warnings of the account in the moderation log, by the moderator of `modEmail`. */
export async function addPastWarnings(username: string, modEmail: string, count: number) {
  for (let i = 0; i < count; i++) {
    await query(
      `insert into moderation_actions (mod_id, target_type, target_id, action, note)
       select m.id, 'user', u.id, 'warn_user', 'Cảnh cáo trước đó'
       from users u, users m where u.username = $1 and m.email = $2`,
      [username, modEmail],
    );
  }
}

/**
 * Gives the story `readers` distinct readers on the first day of last month (Vietnam time), as the
 * worker's flush would have: the source of the monthly featured suggestions.
 */
export async function addLastMonthReaders(publicId: string, readers: number): Promise<void> {
  const { from } = previousVnMonth(statsDate(new Date()));
  await query(
    `insert into story_daily_stats (story_id, date, unique_readers)
     select id, $2::date, $3 from stories where public_id = $1
     on conflict (story_id, date) do update set unique_readers = excluded.unique_readers`,
    [publicId, from, readers],
  );
}

/** Removes the story's stats from last month again, so rankings of other specs never see them. */
export async function removeLastMonthReaders(publicId: string): Promise<void> {
  const { from } = previousVnMonth(statsDate(new Date()));
  await query(
    `delete from story_daily_stats
     where story_id = (select id from stories where public_id = $1) and date = $2::date`,
    [publicId, from],
  );
}

/** Ends every featured slot of the story now, so it leaves the home page for the other specs. */
export async function endFeaturedSlots(publicId: string): Promise<void> {
  await query(
    `update featured_slots set ends_at = greatest(now(), starts_at + interval '1 second')
     where story_id = (select id from stories where public_id = $1) and ends_at > now()`,
    [publicId],
  );
}
