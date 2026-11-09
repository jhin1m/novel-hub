import { type ChapterStatus, LIMITS } from '@novel-hub/shared';

/** Why the publish button is locked; the editor turns it into a sentence next to the button. */
export type PublishBlockReason =
  | { kind: 'hidden_by_mod' }
  | { kind: 'too_short'; missing: number }
  | { kind: 'too_long'; extra: number };

/**
 * The single source of truth for locking the publish button (sending a request is a separate,
 * momentary lock). A moderator hide wins over the word count: editing cannot lift it.
 */
export function publishBlockReason(
  words: number,
  status: ChapterStatus,
  limits: { min: number; max: number } = LIMITS.chapterWords,
): PublishBlockReason | null {
  if (status === 'hidden_by_mod') return { kind: 'hidden_by_mod' };
  if (words < limits.min) return { kind: 'too_short', missing: limits.min - words };
  if (words > limits.max) return { kind: 'too_long', extra: words - limits.max };
  return null;
}
