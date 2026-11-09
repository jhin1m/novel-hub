import { CONTINUE_ROWS_MAX } from './account-hint';

/**
 * The reading-history entries the home "Continue reading" bar may show. The history API lists 18+
 * stories too (it is the reader's own list), so they are dropped unless the account shows them.
 * Takes the smallest shape it needs, so it works on the JSON the API returns.
 */
export function continueRows<T extends { story: { isMature: boolean } }>(
  items: readonly T[],
  showMature: boolean,
  max = CONTINUE_ROWS_MAX,
): T[] {
  return items.filter((item) => showMature || !item.story.isMature).slice(0, max);
}
