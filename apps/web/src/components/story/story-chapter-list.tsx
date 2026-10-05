import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';

/** Table of contents of a public story: every readable chapter, linked with plain document links. */
export function StoryChapterList({
  story,
  chapters,
}: {
  story: { slug: string; publicId: string };
  chapters: { number: number; title: string | null }[];
}) {
  if (chapters.length === 0) {
    return <p className="text-muted-foreground">{m.story_page_toc_empty()}</p>;
  }
  return (
    <ol className="divide-y border-y">
      {chapters.map((chapter) => (
        <li key={chapter.number}>
          <a
            href={canonicalPath({ kind: 'chapter', ...story, number: chapter.number })}
            className="flex gap-2 py-3 underline-offset-4 hover:underline"
          >
            <span className="shrink-0 text-muted-foreground">
              {m.reader_chapter_label({ number: chapter.number })}
            </span>
            {chapter.title ? <span className="min-w-0 truncate">{chapter.title}</span> : null}
          </a>
        </li>
      ))}
    </ol>
  );
}
