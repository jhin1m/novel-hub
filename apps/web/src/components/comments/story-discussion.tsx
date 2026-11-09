import { m } from '@novel-hub/shared/messages';
import { useId, useRef } from 'react';
import { type CommentScope, useStoryDiscussion } from '@/lib/comments';
import { useMe } from '@/lib/me';
import { useNearViewport } from '@/lib/use-near-viewport';
import { SectionHeading } from '../section-heading';
import { CommentComposer } from './comment-composer';
import { CommentFeed } from './comment-feed';

/**
 * The "Discussion" section of a story page: comments about the story as a whole, tied to no
 * chapter, with the same threads, pins and rules as a chapter's. The server-rendered page only has
 * the empty section (its HTML is cached and the same for everyone); the threads load in the browser
 * once the reader scrolls near it. Nothing loads while `enabled` is false (the 18+ screen is up).
 */
export function StoryDiscussion({ publicId, enabled }: { publicId: string; enabled: boolean }) {
  const id = useId();
  const ref = useRef<HTMLElement>(null);
  const near = useNearViewport(ref, enabled);
  const me = useMe();
  const viewer = me.data?.username ?? null;
  // Waits for the session so `isOwn` and `viewerCanPin` are right on the first load.
  const comments = useStoryDiscussion(publicId, viewer, near && !me.isPending);
  const total = comments.data?.pages[0]?.total;
  const scope: CommentScope = { publicId, number: null };

  return (
    <section
      ref={ref}
      id="discussion"
      aria-labelledby={`${id}-heading`}
      className="flex scroll-mt-20 flex-col gap-5"
    >
      <SectionHeading
        id={`${id}-heading`}
        title={
          total == null ? m.discussion_heading() : m.discussion_heading_count({ count: total })
        }
        subtitle={m.discussion_hint()}
      />
      {enabled ? <CommentComposer scope={scope} placeholder={m.discussion_placeholder()} /> : null}
      <CommentFeed
        scope={scope}
        viewer={viewer}
        comments={comments}
        active={near}
        emptyText={m.discussion_empty()}
      />
    </section>
  );
}
