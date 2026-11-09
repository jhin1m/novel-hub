import type { TopReaderDto } from '@novel-hub/core';
import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';

/** The ranked names; only the rank shows, never a score. */
export function TopReaderList({ readers }: { readers: TopReaderDto[] }) {
  return (
    <ol className="flex flex-col gap-1">
      {readers.map((reader) => (
        <li key={reader.username} className="flex items-center gap-3 py-1">
          <span className="sr-only">{m.ranking_rank({ rank: String(reader.rank) })}</span>
          <span
            aria-hidden="true"
            className="w-7 shrink-0 text-center text-lg leading-none font-bold text-muted-foreground tabular-nums"
          >
            {reader.rank}
          </span>
          <a
            href={canonicalPath({ kind: 'author', username: reader.username })}
            className="min-w-0 truncate font-semibold underline-offset-4 hover:underline"
          >
            {reader.displayName}
          </a>
        </li>
      ))}
    </ol>
  );
}
