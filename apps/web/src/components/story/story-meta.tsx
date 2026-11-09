import { m } from '@novel-hub/shared/messages';
import { formatDate, formatDecimal, formatWordCount } from '../../lib/format';

/**
 * The story's numbers as one row of figures: chapters, words, pace and last update (the last two
 * only when known). Colours come from the surrounding text, so the row reads the same with or
 * without a cover behind it. On a narrow screen the (up to four) columns spread across the width,
 * each as wide as its figure, so a date never has to break.
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
    <dl className="flex flex-wrap justify-between gap-x-4 gap-y-3 md:justify-start md:gap-x-9 md:gap-y-3.5">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-xs md:text-[13px]">{label}</dt>
          <dd className="text-sm font-bold whitespace-nowrap md:text-[22px]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
