import type { ChapterStatus, StoryStatus, StoryVisibility } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Badge, type badgeVariants } from './ui/badge';
import type { VariantProps } from 'class-variance-authority';
import {
  CHAPTER_STATUS_LABELS,
  STORY_STATUS_LABELS,
  VISIBILITY_LABELS,
} from './story/story-labels';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

/*
 * One look per state across the site: live states are the soft accent, finished ones neutral,
 * waiting ones amber, drafts muted and anything a moderator hid is outlined in red.
 */
const STORY_STATUS_VARIANTS: Record<StoryStatus, BadgeVariant> = {
  ongoing: 'default',
  completed: 'secondary',
  hiatus: 'warning',
};

const STORY_VISIBILITY_VARIANTS: Record<StoryVisibility, BadgeVariant> = {
  published: 'default',
  draft: 'muted',
  hidden_by_mod: 'destructive',
};

const CHAPTER_STATUS_VARIANTS: Record<ChapterStatus, BadgeVariant> = {
  published: 'default',
  draft: 'muted',
  scheduled: 'warning',
  hidden_by_mod: 'destructive',
};

export function StoryStatusBadge({ status }: { status: StoryStatus }) {
  return <Badge variant={STORY_STATUS_VARIANTS[status]}>{STORY_STATUS_LABELS[status]()}</Badge>;
}

export function StoryVisibilityBadge({ visibility }: { visibility: StoryVisibility }) {
  return (
    <Badge variant={STORY_VISIBILITY_VARIANTS[visibility]}>{VISIBILITY_LABELS[visibility]()}</Badge>
  );
}

export function ChapterStatusBadge({ status }: { status: ChapterStatus }) {
  return <Badge variant={CHAPTER_STATUS_VARIANTS[status]}>{CHAPTER_STATUS_LABELS[status]()}</Badge>;
}

/** "Có dùng AI" and "18+" labels; renders nothing when neither flag is set. */
export function StoryFlagBadges({
  isAiAssisted,
  isMature,
}: {
  isAiAssisted: boolean;
  isMature: boolean;
}) {
  if (!isAiAssisted && !isMature) return null;
  return (
    <>
      {isAiAssisted ? <Badge variant="outline">{m.story_card_ai()}</Badge> : null}
      {isMature ? <Badge variant="destructive">{m.story_card_mature()}</Badge> : null}
    </>
  );
}
