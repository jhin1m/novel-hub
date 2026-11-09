import type { NotificationDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { ShieldAlert } from 'lucide-react';
import type { MouseEvent } from 'react';
import { formatRelativeTime } from '../../lib/relative-time';
import { cn } from '../../lib/utils';
import { StoryCover } from '../story-cover';

/** The sentence a notification shows; for new chapters, the chapter itself or the count. */
export function notificationText(n: NotificationDto): string {
  switch (n.type) {
    case 'chapter_published': {
      if (n.count > 1) return m.notification_chapters_new({ story: n.story.title, count: n.count });
      const chapter = n.chapter.title
        ? m.notification_chapter_titled({ number: n.chapter.number, title: n.chapter.title })
        : m.chapter_number({ number: n.chapter.number });
      return m.notification_chapter_new({ story: n.story.title, chapter });
    }
    case 'story_announcement':
      return m.notification_story_announcement({ story: n.story.title });
    case 'user_warned':
      return m.notification_user_warned({ reason: n.reason });
  }
}

/** The smaller second line under the sentence, if the notification has one. */
export function notificationDetail(n: NotificationDto): string | null {
  switch (n.type) {
    case 'chapter_published':
      return null;
    case 'story_announcement':
      return n.excerpt;
    case 'user_warned':
      return m.notification_user_warned_hint();
  }
}

/**
 * Where a notification leads: the latest of its chapters that can still be read, the story's
 * announcements, or the content policy for a warning.
 */
export function notificationHref(n: NotificationDto): string {
  switch (n.type) {
    case 'chapter_published':
      return canonicalPath({
        kind: 'chapter',
        slug: n.story.slug,
        publicId: n.story.publicId,
        number: n.chapter.number,
      });
    case 'story_announcement':
      return `${canonicalPath({ kind: 'story', slug: n.story.slug, publicId: n.story.publicId })}#announcements`;
    case 'user_warned':
      return canonicalPath({ kind: 'static', path: '/content-policy' });
  }
}

/**
 * One notification: small cover (an icon for a warning), text, relative time and an unread dot. A
 * real link (opens in a new tab too); `onOpen` lets the list mark it read before leaving.
 */
export function NotificationItem({
  notification,
  onOpen,
}: {
  notification: NotificationDto;
  onOpen?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { read, createdAt } = notification;
  const detail = notificationDetail(notification);
  return (
    <a
      href={notificationHref(notification)}
      onClick={onOpen}
      className={cn(
        'flex items-start gap-3 rounded-lg p-3 outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring',
        !read && 'bg-primary-soft/40',
      )}
    >
      {notification.type === 'user_warned' ? (
        <span
          aria-hidden
          className="flex aspect-[2/3] w-12 shrink-0 items-center justify-center rounded-sm bg-muted text-muted-foreground"
        >
          <ShieldAlert className="size-5" />
        </span>
      ) : (
        <StoryCover
          title={notification.story.title}
          authorName={notification.story.author.displayName}
          mainTagSlug={notification.story.mainTag.slug}
          coverUrl={notification.story.coverUrl}
          sizes="48px"
          className="w-12 shrink-0 rounded-sm"
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={cn('text-[15px] leading-snug wrap-anywhere', !read && 'font-semibold')}>
          {notificationText(notification)}
        </span>
        {detail ? (
          <span className="line-clamp-2 text-sm wrap-anywhere text-muted-foreground">{detail}</span>
        ) : null}
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
