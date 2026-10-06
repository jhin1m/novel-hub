import type { NotificationDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import type { MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { useMarkNotificationsRead, useNotifications } from '@/lib/notifications';
import { NotificationItem } from './notification-item';

/** The reader's notifications, newest first, with "load more" and "mark all read". */
export function NotificationList() {
  const list = useNotifications(true);
  const markRead = useMarkNotificationsRead();

  if (list.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {m.library_loading()}
      </p>
    );
  }
  if (list.isError) {
    return (
      <p role="alert" className="text-muted-foreground">
        {m.error_generic()}
      </p>
    );
  }
  const items = list.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return <p className="text-muted-foreground">{m.notification_empty()}</p>;
  }

  /**
   * Marks an unread notification read, then follows its link with a full load (chapter pages are
   * cached HTML). Modified clicks (new tab) keep the browser's behaviour; a failed request still
   * opens the chapter.
   */
  const open = (n: NotificationDto) => (event: MouseEvent<HTMLAnchorElement>) => {
    if (n.read || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    const href = event.currentTarget.href;
    markRead.mutate({ ids: [n.id] }, { onSettled: () => window.location.assign(href) });
  };

  return (
    <div className="flex flex-col gap-4">
      {items.some((n) => !n.read) ? (
        <Button
          variant="outline"
          size="sm"
          className="self-end"
          disabled={markRead.isPending}
          onClick={() => markRead.mutate({ all: true })}
        >
          {m.notification_mark_all_read()}
        </Button>
      ) : null}
      <ul className="flex flex-col gap-1">
        {items.map((n) => (
          <li key={n.id}>
            <NotificationItem notification={n} onOpen={open(n)} />
          </li>
        ))}
      </ul>
      {list.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {m.history_load_more()}
        </Button>
      ) : null}
    </div>
  );
}
