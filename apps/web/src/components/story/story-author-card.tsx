import { canonicalPath } from '@novel-hub/shared';
import { formatInitial } from '../../lib/format';

/** The author beside the story: initial, pen name and @username, linking to the author page. */
export function StoryAuthorCard({ author }: { author: { username: string; displayName: string } }) {
  return (
    <a
      href={canonicalPath({ kind: 'author', username: author.username })}
      className="flex items-center gap-3.5 rounded-[22px] border border-border bg-card p-4 outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      <span
        aria-hidden="true"
        className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-primary-soft text-xl font-extrabold text-primary"
      >
        {formatInitial(author.displayName)}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-bold">{author.displayName}</span>
        <span className="truncate text-sm text-muted-foreground">@{author.username}</span>
      </span>
    </a>
  );
}
