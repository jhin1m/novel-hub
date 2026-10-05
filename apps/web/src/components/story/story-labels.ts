import type { ChapterStatus, StoryStatus, StoryVisibility, TagKind } from '@novel-hub/shared';
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

export const VISIBILITY_LABELS: Record<StoryVisibility, () => string> = {
  draft: m.story_visibility_draft,
  published: m.story_visibility_published,
  hidden_by_mod: m.story_visibility_hidden_by_mod,
};

export const CHAPTER_STATUS_LABELS: Record<ChapterStatus, () => string> = {
  draft: m.chapter_status_draft,
  scheduled: m.chapter_status_scheduled,
  published: m.chapter_status_published,
  hidden_by_mod: m.chapter_status_hidden_by_mod,
};
