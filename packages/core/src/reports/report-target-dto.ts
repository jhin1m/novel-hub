import type { AnnouncementContext, AnnouncementWithStory } from './announcement-report-context';
import type { RatingContext, RatingWithStory } from './rating-report-context';
import type {
  ChapterContext,
  ChapterWithStory,
  CommentContext,
  CommentWithChapter,
  StoryContext,
  UserContext,
} from './report-context';

export type ReportTargetDto =
  | { type: 'story'; story: StoryContext }
  | { type: 'chapter'; story: StoryContext; chapter: ChapterContext }
  | { type: 'user'; user: UserContext }
  /** `chapter` is `null` for a comment in the story's discussion. */
  | {
      type: 'comment';
      story: StoryContext;
      chapter: ChapterContext | null;
      comment: CommentContext;
    }
  | { type: 'rating'; story: StoryContext; rating: RatingContext }
  | { type: 'announcement'; story: StoryContext; announcement: AnnouncementContext }
  /** The target no longer exists (or the row names an unknown type). */
  | { type: 'missing' };

/**
 * The account a target belongs to, as the queue acts on it: the user, the writer of the comment or
 * rating, or the author of the story, chapter or announcement.
 */
export function reportTargetOwner(target: ReportTargetDto): UserContext | null {
  switch (target.type) {
    case 'user':
      return target.user;
    case 'comment':
      return target.comment.writer;
    case 'rating':
      return target.rating.writer;
    case 'story':
    case 'chapter':
    case 'announcement':
      return target.story.author;
    case 'missing':
      return null;
  }
}

/** Context of every target type on a page, by internal id. */
export interface TargetMaps {
  storyMap: Map<string, StoryContext>;
  chapterMap: Map<string, ChapterWithStory>;
  userMap: Map<string, UserContext>;
  commentMap: Map<string, CommentWithChapter>;
  ratingMap: Map<string, RatingWithStory>;
  announcementMap: Map<string, AnnouncementWithStory>;
}

/** The DTO of a report's target from the loaded contexts; `missing` when it is gone. */
export function targetDto(type: string, id: string, maps: TargetMaps): ReportTargetDto {
  const { storyMap, chapterMap, userMap, commentMap, ratingMap, announcementMap } = maps;
  if (type === 'story') {
    const story = storyMap.get(id);
    return story ? { type, story } : { type: 'missing' };
  }
  if (type === 'chapter') {
    const found = chapterMap.get(id);
    return found ? { type, ...found } : { type: 'missing' };
  }
  if (type === 'user') {
    const user = userMap.get(id);
    return user ? { type, user } : { type: 'missing' };
  }
  if (type === 'comment') {
    const found = commentMap.get(id);
    return found ? { type, ...found } : { type: 'missing' };
  }
  if (type === 'rating') {
    const found = ratingMap.get(id);
    return found ? { type, ...found } : { type: 'missing' };
  }
  if (type === 'announcement') {
    const found = announcementMap.get(id);
    return found ? { type, ...found } : { type: 'missing' };
  }
  return { type: 'missing' };
}
