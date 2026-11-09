import { type Db, featuredSlots, stories } from '@novel-hub/db';
import { previousVnMonth, statsDate } from '@novel-hub/shared';
import { and, gt, inArray } from 'drizzle-orm';
import { type StoryCardDto, selectStoryCardsWith, toStoryCard } from '../catalog/story-card';
import { type Result, err, ok } from '../lib/result';
import { canModerate } from '../policies/moderation';
import { rankStoriesInWindow } from '../rankings/compute-rankings';
import type { CurrentUser } from '../users/current-user';

/** Stories suggested for the featured block at once. */
const SUGGESTIONS_MAX = 10;

export interface FeatureSuggestionsDto {
  /** The month the suggestions come from, `M/YYYY`. */
  month: string;
  items: { story: StoryCardDto; readers: number }[];
}

/**
 * Stories to consider featuring: the most read of the previous calendar month (Vietnam time), by
 * the sum of their daily distinct readers, best first, at most `SUGGESTIONS_MAX`. Left out: 18+
 * stories and hidden or banned ones (the featured block is in publicly cached HTML), stories with a
 * slot that has not ended (running or upcoming), and the moderator's own (the form refuses them).
 * Only a suggestion: the moderator still creates the slot.
 */
export async function listFeatureSuggestions(
  db: Db,
  actor: CurrentUser,
  now: Date = new Date(),
): Promise<Result<FeatureSuggestionsDto, 'FORBIDDEN'>> {
  if (!canModerate(actor)) return err('FORBIDDEN');
  const { from, to, label } = previousVnMonth(statsDate(now));
  const ranked = await rankStoriesInWindow(db, { from, to }, { includeMature: false });
  if (ranked.length === 0) return ok({ month: label, items: [] });

  const ids = ranked.map((r) => r.storyId);
  const [featured, cards] = await Promise.all([
    db
      .selectDistinct({ storyId: featuredSlots.storyId })
      .from(featuredSlots)
      .where(and(inArray(featuredSlots.storyId, ids), gt(featuredSlots.endsAt, now))),
    selectStoryCardsWith(db, { authorId: stories.authorId }).where(inArray(stories.id, ids)),
  ]);
  const taken = new Set(featured.map((row) => row.storyId));
  const byId = new Map(cards.map((card) => [card.id, card]));
  const items = ranked.flatMap(({ storyId, readers }) => {
    const card = byId.get(storyId);
    if (!card || taken.has(storyId) || card.authorId === actor.id) return [];
    return [{ story: toStoryCard(card), readers }];
  });
  return ok({ month: label, items: items.slice(0, SUGGESTIONS_MAX) });
}
