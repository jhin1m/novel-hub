import { createTestDb } from '@novel-hub/db/testing';
import { nominationWeekStart } from '@novel-hub/shared';

let counter = 0;

/**
 * Gives each story `votes` nominations this week, from fresh verified voters written straight in
 * the test database, in the order given (so ties go to the earlier entry).
 */
export async function nominateStories(entries: readonly { publicId: string; votes: number }[]) {
  const weekStart = nominationWeekStart(new Date());
  const { pool } = createTestDb();
  try {
    for (const entry of entries) {
      for (let i = 0; i < entry.votes; i++) {
        counter += 1;
        const username = `v_${Date.now().toString(36)}${counter}`;
        await pool.query(
          `with voter as (
             insert into users (username, display_name, email, email_verified)
             values ($1, $1, $1 || '@example.com', true)
             returning id
           )
           insert into story_nominations (user_id, story_id, week_start)
           select voter.id, stories.id, $3::date from voter, stories where stories.public_id = $2`,
          [username, entry.publicId, weekStart],
        );
      }
    }
  } finally {
    await pool.end();
  }
}
