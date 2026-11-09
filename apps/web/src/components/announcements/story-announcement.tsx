import type { AnnouncementDto } from '@novel-hub/core';
import { m } from '@novel-hub/shared/messages';
import { MegaphoneIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatDate } from '../../lib/format';
import { SectionHeading } from '../section-heading';

/**
 * The author's latest announcement on the story page (`#announcements`, the target of its
 * notification). Plain text, rendered as text. `children` (a report button) shows under it.
 */
export function StoryAnnouncement({
  announcement,
  children,
}: {
  announcement: AnnouncementDto;
  children?: ReactNode;
}) {
  return (
    <section
      id="announcements"
      aria-labelledby="story-announcement"
      className="flex flex-col gap-3"
    >
      <SectionHeading
        id="story-announcement"
        icon={MegaphoneIcon}
        title={m.announcement_heading()}
      />
      <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">
          {m.announcement_posted_at({ date: formatDate(announcement.createdAt) })}
        </p>
        <p className="leading-relaxed whitespace-pre-line">{announcement.body}</p>
        {children ? <div className="flex justify-end">{children}</div> : null}
      </article>
    </section>
  );
}
