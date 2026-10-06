import type { BadgeCode } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import {
  BookCheckIcon,
  BookOpenIcon,
  LibraryBigIcon,
  type LucideIcon,
  PenLineIcon,
  ScrollTextIcon,
  TypeIcon,
  UsersIcon,
  UsersRoundIcon,
} from 'lucide-react';

export interface BadgeDisplay {
  icon: LucideIcon;
  name: () => string;
  description: () => string;
}

/** Icon and labels of every catalog badge; a new code without an entry fails the typecheck. */
export const BADGE_DISPLAY: Record<BadgeCode, BadgeDisplay> = {
  first_chapter: {
    icon: PenLineIcon,
    name: m.badge_first_chapter_name,
    description: m.badge_first_chapter_description,
  },
  chapters_10: {
    icon: BookOpenIcon,
    name: m.badge_chapters_10_name,
    description: m.badge_chapters_10_description,
  },
  chapters_100: {
    icon: LibraryBigIcon,
    name: m.badge_chapters_100_name,
    description: m.badge_chapters_100_description,
  },
  words_100k: {
    icon: TypeIcon,
    name: m.badge_words_100k_name,
    description: m.badge_words_100k_description,
  },
  words_1m: {
    icon: ScrollTextIcon,
    name: m.badge_words_1m_name,
    description: m.badge_words_1m_description,
  },
  followers_10: {
    icon: UsersIcon,
    name: m.badge_followers_10_name,
    description: m.badge_followers_10_description,
  },
  followers_100: {
    icon: UsersRoundIcon,
    name: m.badge_followers_100_name,
    description: m.badge_followers_100_description,
  },
  story_completed: {
    icon: BookCheckIcon,
    name: m.badge_story_completed_name,
    description: m.badge_story_completed_description,
  },
};
