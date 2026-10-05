import { m } from '@novel-hub/shared/messages';
import { formatDate, formatDecimal, formatWordCount } from '../../lib/format';

/**
 * The story's numbers as one row of figures split by thin rules: chapters, words, pace and last
 * update (the last two only when known). Colours come from the surrounding text, so the row reads
 * the same on the cover-coloured hero. On a narrow screen the (up to four) columns spread across
 * the width, each as wide as its figure, so a date never has to break.
 */
export function StoryMeta({
  chapterCount,
  wordCount,
  chaptersPerWeek,
  lastChapterAt,
}: {
  chapterCount: number;
  wordCount: number;
  chaptersPerWeek: number | null;
  lastChapterAt: string | null;
}) {
  const items: [string, string][] = [
    [m.story_page_stat_chapters(), String(chapterCount)],
    [m.story_page_stat_words(), formatWordCount(wordCount)],
  ];
  if (chaptersPerWeek !== null) {
    items.push([
      m.story_page_stat_pace(),
      m.story_page_pace_short({ count: formatDecimal(chaptersPerWeek) }),
    ]);
  }
  if (lastChapterAt) items.push([m.story_page_stat_updated(), formatDate(lastChapterAt)]);
  return (
    <dl className="flex flex-wrap justify-between gap-y-3 divide-x divide-current/25 md:justify-start">
      {items.map(([label, value]) => (
        // Value above its label on screen; the label still comes first for screen readers.
        <div
          key={label}
          className="flex flex-col-reverse gap-0.5 px-2.5 first:pl-0 last:pr-0 md:px-6"
        >
          <dt className="text-xs font-semibold">{label}</dt>
          <dd className="text-sm font-extrabold tracking-tight whitespace-nowrap md:text-xl">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
