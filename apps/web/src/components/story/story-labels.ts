import type { StoryStatus, TagKind } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';

export const STORY_STATUS_LABELS: Record<StoryStatus, () => string> = {
  ongoing: m.story_status_ongoing,
  completed: m.story_status_completed,
  hiatus: m.story_status_hiatus,
};

export const TAG_KIND_LABELS: Record<TagKind, () => string> = {
  genre: m.story_tag_kind_genre,
  theme: m.story_tag_kind_theme,
  warning: m.story_tag_kind_warning,
};
