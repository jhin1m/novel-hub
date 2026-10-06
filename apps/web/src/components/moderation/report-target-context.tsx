import type { ChapterContext, ReportDto, StoryContext } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { Badge } from '@/components/ui/badge';
import { textLinkClass } from '../auth-ui';

export function StoryLine({ story }: { story: StoryContext }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <a href={canonicalPath({ kind: 'story', ...story })} className={textLinkClass}>
        {story.title}
      </a>
      <span className="text-sm text-muted-foreground">
        {m.moderation_by_author({
          name: story.author.displayName,
          username: story.author.username,
        })}
      </span>
      {story.visibility === 'hidden_by_mod' ? (
        <Badge variant="destructive">{m.moderation_state_hidden()}</Badge>
      ) : null}
      {story.visibility === 'draft' ? (
        <Badge variant="muted">{m.moderation_state_draft()}</Badge>
      ) : null}
      <UserStatusBadge status={story.author.status} />
    </p>
  );
}

export function ChapterLine({ story, chapter }: { story: StoryContext; chapter: ChapterContext }) {
  const label = chapter.title
    ? `${m.moderation_chapter_label({ number: chapter.number })}: ${chapter.title}`
    : m.moderation_chapter_label({ number: chapter.number });
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <a
        href={canonicalPath({ kind: 'chapter', ...story, number: chapter.number })}
        className={textLinkClass}
      >
        {label}
      </a>
      {chapter.deleted ? <Badge variant="muted">{m.moderation_state_deleted()}</Badge> : null}
      {chapter.status === 'hidden_by_mod' ? (
        <Badge variant="destructive">{m.moderation_state_hidden()}</Badge>
      ) : null}
      {chapter.status === 'draft' ? (
        <Badge variant="muted">{m.moderation_state_draft()}</Badge>
      ) : null}
      {chapter.status === 'scheduled' ? (
        <Badge variant="warning">{m.moderation_state_scheduled()}</Badge>
      ) : null}
    </p>
  );
}

function UserStatusBadge({ status }: { status: StoryContext['author']['status'] }) {
  if (status === 'muted') return <Badge variant="warning">{m.moderation_user_muted()}</Badge>;
  if (status === 'banned') return <Badge variant="destructive">{m.moderation_user_banned()}</Badge>;
  return null;
}

function TargetLabel({ children }: { children: string }) {
  return (
    <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">{children}</p>
  );
}

/** What a report is about, with links to the live pages and the target's current state. */
export function TargetContext({ report }: { report: ReportDto }) {
  const { target } = report;
  switch (target.type) {
    case 'story':
      return (
        <div className="flex flex-col gap-1">
          <TargetLabel>{m.moderation_target_story()}</TargetLabel>
          <StoryLine story={target.story} />
        </div>
      );
    case 'chapter':
      return (
        <div className="flex flex-col gap-1">
          <TargetLabel>{m.moderation_target_chapter()}</TargetLabel>
          <ChapterLine story={target.story} chapter={target.chapter} />
          <StoryLine story={target.story} />
        </div>
      );
    case 'user':
      return (
        <div className="flex flex-col gap-1">
          <TargetLabel>{m.moderation_target_user()}</TargetLabel>
          <p className="flex flex-wrap items-center gap-2">
            <a
              href={canonicalPath({ kind: 'author', username: target.user.username })}
              className={textLinkClass}
            >
              {target.user.displayName} (@{target.user.username})
            </a>
            <UserStatusBadge status={target.user.status} />
          </p>
        </div>
      );
    case 'comment': {
      const { comment } = target;
      return (
        <div className="flex flex-col gap-1">
          <TargetLabel>
            {comment.isReply ? m.moderation_target_reply() : m.moderation_target_comment()}
          </TargetLabel>
          {/* Plain text from the writer: React escapes it. */}
          <blockquote className="border-l-2 border-border pl-3 whitespace-pre-line">
            {comment.truncated ? `${comment.excerpt}…` : comment.excerpt}
          </blockquote>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <a
              href={canonicalPath({ kind: 'author', username: comment.writer.username })}
              className={textLinkClass}
            >
              {m.moderation_comment_by({
                name: comment.writer.displayName,
                username: comment.writer.username,
              })}
            </a>
            {comment.status === 'hidden_by_mod' ? (
              <Badge variant="destructive">{m.moderation_state_hidden()}</Badge>
            ) : null}
            {comment.status === 'deleted' ? (
              <Badge variant="muted">{m.moderation_comment_deleted()}</Badge>
            ) : null}
            <UserStatusBadge status={comment.writer.status} />
          </p>
          <ChapterLine story={target.story} chapter={target.chapter} />
          <StoryLine story={target.story} />
        </div>
      );
    }
    case 'missing':
      return <p className="text-muted-foreground">{m.moderation_target_missing()}</p>;
  }
}
