import type { AuthorAnnouncementDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { MegaphoneIcon } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { SectionHeading } from '../section-heading';

/**
 * The author's latest announcements on their page, each linked to its story. The server never
 * passes one about an 18+ story (the page is cached for everyone); none → nothing renders.
 */
export function AuthorAnnouncements({ items }: { items: AuthorAnnouncementDto[] }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="author-announcements" className="flex max-w-[720px] flex-col gap-4">
      <SectionHeading
        id="author-announcements"
        icon={MegaphoneIcon}
        title={m.author_page_announcements()}
      />
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={`${item.story.publicId}-${item.createdAt}`}>
            <article className="flex flex-col gap-2 rounded-xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">
                <a
                  href={`${canonicalPath({
                    kind: 'story',
                    slug: item.story.slug,
                    publicId: item.story.publicId,
                  })}#announcements`}
                  className="text-primary underline-offset-4 hover:underline focus-visible:underline"
                >
                  {m.announcement_story_label({ title: item.story.title })}
                </a>
              </p>
              <p className="leading-relaxed whitespace-pre-line">{item.body}</p>
              <p className="text-xs text-muted-foreground">
                {m.announcement_posted_at({ date: formatDate(item.createdAt) })}
              </p>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
