import type { ContentChange } from '../content/hooks';

export interface ChapterChangeTarget {
  storyId: string;
  chapterId: string;
  chapterNumber: number;
}

/**
 * Outbox events for a chapter becoming public or changing while public. `storyPublished` adds the
 * story's own event when this publish also took the story out of `draft`.
 */
export function chapterPublishChanges(
  target: ChapterChangeTarget,
  opts: { firstPublish: boolean; contentHash: string; storyPublished: boolean },
): ContentChange[] {
  const changes: ContentChange[] = [
    {
      entity: 'chapter',
      action: opts.firstPublish ? 'published' : 'updated',
      ...target,
      contentHash: opts.contentHash,
    },
  ];
  if (opts.storyPublished) {
    changes.push({ entity: 'story', action: 'published', storyId: target.storyId });
  }
  return changes;
}

export function chapterDeleteChanges(target: ChapterChangeTarget): ContentChange[] {
  return [{ entity: 'chapter', action: 'deleted', ...target }];
}
