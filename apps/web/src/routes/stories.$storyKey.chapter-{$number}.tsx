import { canonicalPath, parseChapterNumber, parseStoryKey } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { useRef } from 'react';
import { ChapterContent } from '../components/reader/chapter-content';
import { ChapterEnd } from '../components/reader/chapter-end';
import { MatureGate, useMatureAllowed } from '../components/reader/mature-gate';
import { ReaderNav } from '../components/reader/reader-nav';
import { NotFoundPage } from '../components/not-found';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { seo, siteConfig } from '../lib/seo';
import { throwNotFound } from '../lib/route-signals';
import { useArrowKeys } from '../lib/reader/use-arrow-keys';
import { useNavVisibility } from '../lib/reader/use-nav-visibility';
import { useReadingProgress } from '../lib/reader/use-reading-progress';
import { useResumeScroll } from '../lib/reader/use-resume-scroll';
import { useViewBeacon } from '../lib/reader/use-view-beacon';
import { useMe } from '../lib/me';
import { getChapterPage } from '../server-fns/reader';

export const Route = createFileRoute('/stories/$storyKey/chapter-{$number}')({
  // Never reads the session: the HTML is the same for every visitor and cached by the CDN.
  loader: async ({ params, location }) => {
    const key = parseStoryKey(params.storyKey.toLowerCase());
    const number = parseChapterNumber(params.number);
    if (!key || number === null) throwNotFound();
    const page = await getChapterPage({ data: { publicId: key.publicId, number } });
    if (!page) throwNotFound();
    const { slug, publicId } = page.story;
    assertCanonical(
      requestLocation(location),
      canonicalPath({ kind: 'chapter', slug, publicId, number }),
    );
    return page;
  },
  headers: ({ match, loaderData }) =>
    publicPageHeaders(match.status, { noindex: loaderData?.story.isMature }),
  head: ({ loaderData, matches }) => {
    if (!loaderData) return {};
    const { story, chapter } = loaderData;
    return seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: canonicalPath({ kind: 'chapter', ...story, number: chapter.number }),
      title: m.reader_page_title({ chapter: chapterLabel(chapter), story: story.title }),
      description: chapter.title
        ? m.reader_page_description_titled({
            number: String(chapter.number),
            title: chapter.title,
            story: story.title,
            author: story.authorDisplayName,
          })
        : m.reader_page_description({
            number: String(chapter.number),
            story: story.title,
            author: story.authorDisplayName,
          }),
      image: story.coverUrl,
      type: 'article',
      mature: story.isMature,
    });
  },
  notFoundComponent: NotFoundPage,
  component: ReaderPage,
});

/** "Chương 3" or the chapter title when it has one. */
function chapterLabel(chapter: { number: number; title: string | null }): string {
  return chapter.title ?? m.reader_chapter_label({ number: chapter.number });
}

function ReaderPage() {
  const { story, chapter, prevNumber, nextNumber } = Route.useLoaderData();
  const chapterHref = (number: number | null) =>
    number === null ? null : canonicalPath({ kind: 'chapter', ...story, number });
  const prevHref = chapterHref(prevNumber);
  const nextHref = chapterHref(nextNumber);
  const { hidden, onReadingAreaClick } = useNavVisibility();
  const matureAllowed = useMatureAllowed();
  const gated = story.isMature && !matureAllowed;
  useArrowKeys(prevHref, nextHref);
  const me = useMe();
  const contentRef = useRef<HTMLDivElement>(null);
  const chapterRef = { publicId: story.publicId, number: chapter.number };
  // Opened from "continue reading": back to where the reader was.
  const resuming = useResumeScroll(contentRef, chapterRef);
  // Nothing is recorded while the 18+ screen hides the text, nor before the position is restored.
  useReadingProgress(contentRef, chapterRef, !!me.data && !gated && !resuming);
  useViewBeacon(chapterRef, !gated);

  return (
    <div className="reader-page">
      {/* While the 18+ screen shows, everything behind it is out of reach. */}
      <ReaderNav
        inert={gated}
        story={story}
        chapterNumber={chapter.number}
        chapterLabel={chapterLabel(chapter)}
        prevHref={prevHref}
        nextHref={nextHref}
        hidden={hidden}
      />
      <main className="px-4 pt-20 pb-16" inert={gated}>
        <div className="reader-column">
          <header className="mb-10 flex flex-col gap-2 font-sans">
            <a
              href={canonicalPath({ kind: 'story', ...story })}
              className="text-sm text-reader-muted underline-offset-4 hover:underline"
            >
              {story.title}
            </a>
            <p className="text-sm text-reader-muted">
              {m.reader_by_author({ name: story.authorDisplayName })}
            </p>
            {/* Focus target once the 18+ screen goes away. */}
            <h1
              tabIndex={-1}
              className="font-serif text-2xl leading-snug font-semibold outline-none"
            >
              {m.reader_chapter_label({ number: chapter.number })}
              {chapter.title ? `: ${chapter.title}` : null}
            </h1>
          </header>
          <ChapterContent
            html={chapter.html}
            nextHref={nextHref}
            onClick={onReadingAreaClick}
            contentRef={contentRef}
          />
          <ChapterEnd
            nextHref={nextHref}
            authorNote={chapter.authorNote}
            reportTarget={{
              type: 'chapter',
              storyPublicId: story.publicId,
              number: chapter.number,
            }}
          />
        </div>
      </main>
      {story.isMature ? (
        <MatureGate storyTitle={story.title} warningTags={story.warningTags} />
      ) : null}
    </div>
  );
}
