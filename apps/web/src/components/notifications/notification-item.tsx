import type { NotificationDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import type { MouseEvent } from 'react';
import { formatRelativeTime } from '../../lib/relative-time';
import { cn } from '../../lib/utils';
import { StoryCover } from '../story-cover';

/** The sentence a notification shows: the chapter itself when there is one, the count otherwise. */
export function notificationText(n: NotificationDto): string {
  if (n.count > 1) return m.notification_chapters_new({ story: n.story.title, count: n.count });
  const chapter = n.chapter.title
    ? m.notification_chapter_titled({ number: n.chapter.number, title: n.chapter.title })
    : m.chapter_number({ number: n.chapter.number });
  return m.notification_chapter_new({ story: n.story.title, chapter });
}

/** Where a notification leads: the latest of its chapters that can still be read. */
export function notificationHref(n: NotificationDto): string {
  return canonicalPath({
    kind: 'chapter',
    slug: n.story.slug,
    publicId: n.story.publicId,
    number: n.chapter.number,
  });
}

/**
 * One notification: small cover, text, relative time and an unread dot. A real link (opens in a new
 * tab too); `onOpen` lets the list mark it read before leaving.
 */
export function NotificationItem({
  notification,
  onOpen,
}: {
  notification: NotificationDto;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { story, read, createdAt } = notification;
  return (
    <a
      href={notificationHref(notification)}
      onClick={onOpen}
      className={cn(
        'flex items-start gap-3 rounded-lg p-3 outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring',
        !read && 'bg-primary-soft/40',
      )}
    >
      <StoryCover
        title={story.title}
        authorName={story.author.displayName}
        mainTagSlug={story.mainTag.slug}
        coverUrl={story.coverUrl}
        sizes="48px"
        className="w-12 shrink-0 rounded-sm"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn('text-[15px] leading-snug wrap-anywhere', !read && 'font-semibold')}>
          {notificationText(notification)}
        </span>
        <time dateTime={createdAt} className="text-xs text-muted-foreground">
          {formatRelativeTime(createdAt)}
        </time>
      </span>
      {read ? null : (
        <span className="mt-1.5 flex shrink-0 items-center">
          <span aria-hidden className="size-2.5 rounded-full bg-primary" />
          <span className="sr-only">{m.notification_unread()}</span>
        </span>
      )}
    </a>
  );
}
