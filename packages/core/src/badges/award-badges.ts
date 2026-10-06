import { type Db, follows, stories, users } from '@novel-hub/db';
import { BADGES, type BadgeRule } from '@novel-hub/shared';
import { type SQL, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { publicStoryWhere } from '../catalog/story-card';
import { ensureBadgeCatalog } from './badge-catalog';

const follower = alias(users, 'follower');

/** Public stories (published, author not banned, 18+ included) joined with their author. */
const publicStories = sql`from ${stories} join ${users} on ${users.id} = ${stories.authorId}
  where ${publicStoryWhere({ includeMature: true })}`;

/**
 * `select author_id …` of every author who meets `rule`. Followers count only accounts with a
 * verified email that are not banned, so a batch of throwaway sign-ups cannot earn the badge.
 */
export function badgeRuleQuery(rule: BadgeRule): SQL {
  switch (rule.kind) {
    case 'chapters':
      return sql`select ${stories.authorId} as author_id ${publicStories}
        group by ${stories.authorId} having sum(${stories.chapterCount}) >= ${rule.min}`;
    case 'words':
      return sql`select ${stories.authorId} as author_id ${publicStories}
        group by ${stories.authorId} having sum(${stories.wordCount}) >= ${rule.min}`;
    case 'completed_story':
      return sql`select distinct ${stories.authorId} as author_id ${publicStories}
        and ${stories.status} = 'completed' and ${stories.chapterCount} >= 1`;
    case 'followers':
      return sql`select ${follows.targetId} as author_id
        from ${follows}
        join ${users} as ${follower} on ${follower.id} = ${follows.userId}
          and ${follower.emailVerified} and ${follower.status} <> 'banned'
        join ${users} on ${users.id} = ${follows.targetId} and ${users.status} <> 'banned'
        where ${follows.targetType} = 'user'
        group by ${follows.targetId} having count(*) >= ${rule.min}`;
  }
}

/**
 * Awards every catalog badge to the authors who reached it and do not have it yet; returns the
 * number of new awards. One autocommitted `insert … select … on conflict do nothing` per badge (no
 * long transaction), so running it again, or twice at once, awards nothing twice.
 */
export async function awardMilestoneBadges(db: Db): Promise<number> {
  await ensureBadgeCatalog(db);
  let awarded = 0;
  for (const badge of BADGES) {
    const result = await db.execute(sql`
      insert into user_badges (user_id, badge_id)
      select q.author_id, b.id
      from (${badgeRuleQuery(badge.rule)}) q
      join badges b on b.code = ${badge.code}
      on conflict do nothing
    `);
    awarded += result.rowCount ?? 0;
  }
  return awarded;
}
