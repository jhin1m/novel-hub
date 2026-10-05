import type { StoryStatus } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { formatDate, formatDecimal, formatWordCount } from '@/lib/format';
import { STORY_STATUS_LABELS } from './story-labels';

/** The facts of a story, laid out like the colophon of a book. */
export function StoryMeta({
  status,
  chapterCount,
  wordCount,
  chaptersPerWeek,
  lastChapterAt,
}: {
  status: StoryStatus;
  chapterCount: number;
  wordCount: number;
  chaptersPerWeek: number | null;
  lastChapterAt: string | null;
}) {
  const rows: [string, string][] = [
    [m.story_status_label(), STORY_STATUS_LABELS[status]()],
    [m.story_page_chapters(), String(chapterCount)],
    [m.story_page_words(), formatWordCount(wordCount)],
  ];
  if (chaptersPerWeek !== null) {
    rows.push([
      m.story_page_pace(),
      m.story_page_pace_value({ count: formatDecimal(chaptersPerWeek) }),
    ]);
  }
  if (lastChapterAt) rows.push([m.story_page_updated(), formatDate(lastChapterAt)]);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground">{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
