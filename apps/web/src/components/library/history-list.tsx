import { m } from '@novel-hub/shared/messages';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';
import { useHistory, useRemoveFromHistory } from '@/lib/library';
import { ResumeLink } from './continue-reading-button';
import { LibraryStoryRow } from './library-item';

/** The reading history, most recent first, with "load more" and removal of single entries. */
export function HistoryList() {
  const history = useHistory(true);
  const remove = useRemoveFromHistory();

  if (history.isPending) {
    return (
      <p role="status" className="text-muted-foreground">
        {m.library_loading()}
      </p>
    );
  }
  if (history.isError) {
    return (
      <p role="alert" className="text-muted-foreground">
        {m.error_generic()}
      </p>
    );
  }
  const items = history.data.pages.flatMap((page) => page.items);
  if (items.length === 0) {
    return <p className="text-muted-foreground">{m.history_empty()}</p>;
  }
  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-6">
        {items.map((item) => (
          <li key={item.story.publicId}>
            <LibraryStoryRow story={item.story}>
              <ResumeLink
                story={item.story}
                number={item.chapterNumber}
                scrollPct={item.scrollPct}
                size="sm"
              />
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate(item.story.publicId)}
              >
                {m.history_remove()}
              </Button>
              <span className="text-xs text-muted-foreground">
                {m.history_read_at({ date: formatDate(item.updatedAt) })}
              </span>
            </LibraryStoryRow>
          </li>
        ))}
      </ul>
      {history.hasNextPage ? (
        <Button
          variant="outline"
          className="self-center"
          disabled={history.isFetchingNextPage}
          onClick={() => void history.fetchNextPage()}
        >
          {m.history_load_more()}
        </Button>
      ) : null}
    </div>
  );
}
