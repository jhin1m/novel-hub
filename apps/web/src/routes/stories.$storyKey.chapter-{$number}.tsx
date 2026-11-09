import { canonicalPath, parseChapterNumber, parseStoryKey } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { createFileRoute } from '@tanstack/react-router';
import { useRef, useState } from 'react';
import sourceSerif4Latin from '@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2?url';
import sourceSerif4Vietnamese from '@fontsource-variable/source-serif-4/files/source-serif-4-vietnamese-wght-normal.woff2?url';
import { ChapterComments } from '../components/comments/chapter-comments';
import { ParagraphCommentFab } from '../components/comments/paragraph-comment-fab';
import {
  type OpenParagraph,
  ParagraphCommentsSheet,
} from '../components/comments/paragraph-comments-sheet';
import { ChapterContent } from '../components/reader/chapter-content';
import { ChapterEnd } from '../components/reader/chapter-end';
import { ChapterHeader } from '../components/reader/chapter-header';
import { ChapterTocSheet } from '../components/reader/chapter-toc-sheet';
import { ListenBar } from '../components/reader/listen-bar';
import { MatureGate, useMatureAllowed } from '../components/reader/mature-gate';
import { type ReaderPanel, ReaderControls } from '../components/reader/reader-controls';
import { ReaderSettingsSheet } from '../components/reader/reader-settings-sheet';
import { ReaderTopBar } from '../components/reader/reader-top-bar';
import { NotFoundPage } from '../components/not-found';
import { publicPageHeaders } from '../lib/cache-headers';
import { assertCanonical, requestLocation } from '../lib/canonical';
import { fontPreloadLink } from '../lib/font-preload';
import { seo, siteConfig } from '../lib/seo';
import { throwNotFound } from '../lib/route-signals';
import { chapterHeading } from '../lib/reader/chapter-heading';
import { useArrowKeys } from '../lib/reader/use-arrow-keys';
import { useNavVisibility } from '../lib/reader/use-nav-visibility';
import { findParagraph } from '../lib/reader/paragraph-elements';
import { useParagraphSelection } from '../lib/reader/use-paragraph-selection';
import { useReadingProgress } from '../lib/reader/use-reading-progress';
import { useResumeScroll } from '../lib/reader/use-resume-scroll';
import { useChapterSpeech } from '../lib/reader/tts/use-chapter-speech';
import { useViewBeacon } from '../lib/reader/use-view-beacon';
import { useMe } from '../lib/me';
import { getChapterPage } from '../server-fns/reader';

const CONTENT_FONTS = [sourceSerif4Latin, sourceSerif4Vietnamese];

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
    const head = seo({
      appUrl: siteConfig(matches)?.appUrl,
      path: canonicalPath({ kind: 'chapter', ...story, number: chapter.number }),
      title: m.reader_page_title({ chapter: chapterHeading(chapter).heading, story: story.title }),
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
    // Only this route shows story text at first paint, so only it preloads the content font.
    return { ...head, links: [...head.links, ...CONTENT_FONTS.map(fontPreloadLink)] };
  },
  notFoundComponent: NotFoundPage,
  component: ReaderPage,
});

/** Below `lg` the paragraph sheet covers the lower 60% of the screen. */
function hiddenBySheet(element: HTMLElement): boolean {
  const top = element.getBoundingClientRect().top;
  return window.innerWidth < 1024 && (top < 0 || top > window.innerHeight * 0.4);
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
  const [panel, setPanel] = useState<ReaderPanel | null>(null);
  // No panel opens over the 18+ screen: sheets sit above it.
  const openPanel = gated ? null : panel;
  // The control that opened the panel gets focus back when it closes.
  const trigger = useRef<HTMLButtonElement>(null);
  const onOpen = (next: ReaderPanel, button: HTMLButtonElement) => {
    trigger.current = button;
    setPanel((current) => (current === next ? null : next));
  };
  const onOpenChange = (name: ReaderPanel) => (open: boolean) => setPanel(open ? name : null);
  // Listening: the player is not a panel, it stays open while the text is read and scrolled.
  const speech = useChapterSpeech(contentRef, {
    publicId: story.publicId,
    number: chapter.number,
    next: nextNumber === null || !nextHref ? null : { number: nextNumber, href: nextHref },
    enabled: !gated,
  });
  const listenTrigger = useRef<HTMLButtonElement>(null);
  const listening = speech.state !== 'idle';
  const stopListening = () => {
    speech.stop();
    // Opened by the previous chapter, the player has no trigger: focus the visible listen control.
    const fallback = [
      ...document.querySelectorAll<HTMLButtonElement>('.reader-page nav button[aria-pressed]'),
    ].find((button) => button.offsetParent !== null);
    (listenTrigger.current ?? fallback)?.focus();
  };
  const listen = {
    supported: speech.supported,
    active: listening,
    onToggle: (button: HTMLButtonElement) => {
      listenTrigger.current = button;
      if (listening) speech.stop();
      else speech.start();
    },
  };
  const controls = {
    prevHref,
    nextHref,
    activePanel: openPanel,
    onOpen,
    hidden,
    inert: gated,
    listen,
  };
  // Comments about a paragraph: selecting text in one offers them; the list at the end opens them too.
  const selected = useParagraphSelection(contentRef, !gated);
  const [paragraph, setParagraph] = useState<OpenParagraph | null>(null);
  const openParagraph = (pid: string, scroll: boolean) => {
    const element = findParagraph(contentRef.current, pid);
    // To the top (instant, so no reduced-motion variant) when asked, or when the paragraph would
    // sit behind the bottom sheet of small screens.
    if (element && (scroll || hiddenBySheet(element))) element.scrollIntoView({ block: 'start' });
    // The selection did its job; leaving it would keep the phone's copy toolbar up.
    window.getSelection()?.removeAllRanges();
    setPanel(null);
    setParagraph({ pid, excerpt: element?.textContent ?? '', open: true });
  };

  return (
    <>
      <div
        className="reader-page"
        // The bottom bar shows below `lg`: marks the page for the shared bottom-bar scroll padding.
        data-bottom-bar="lg"
        // The player covers the bottom of the page: room is kept so the end stays reachable.
        data-listening={listening || undefined}
      >
        {/* While the 18+ screen shows, everything behind it is out of reach. */}
        <ReaderTopBar
          story={story}
          chapterNumber={chapter.number}
          chapterTitle={chapter.title}
          hidden={hidden}
          contentRef={contentRef}
          inert={gated}
        />
        <ReaderControls variant="bar" {...controls} />
        <ReaderControls variant="rail" {...controls} />
        {/* Side insets keep the text clear of a landscape notch; the bottom one clears the bar and the home indicator. */}
        <main
          className="pt-[76px] pr-[max(1rem,env(safe-area-inset-right))] pb-[calc(7rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] lg:pt-[84px] lg:pb-16"
          inert={gated}
        >
          <div className="reader-column">
            <ChapterHeader chapter={chapter} />
            <ChapterContent
              html={chapter.html}
              nextHref={nextHref}
              onClick={onReadingAreaClick}
              contentRef={contentRef}
            />
            <ChapterEnd
              prevHref={prevHref}
              nextHref={nextHref}
              authorNote={chapter.authorNote}
              authorName={story.authorDisplayName}
              reportTarget={{
                type: 'chapter',
                storyPublicId: story.publicId,
                number: chapter.number,
              }}
            />
            <ChapterComments
              chapter={chapterRef}
              enabled={!gated}
              contentRef={contentRef}
              onOpenParagraph={(pid) => openParagraph(pid, true)}
            />
          </div>
        </main>
        <ChapterTocSheet
          story={story}
          current={chapter.number}
          open={openPanel === 'toc'}
          onOpenChange={onOpenChange('toc')}
          trigger={trigger}
        />
        {listening ? <ListenBar speech={speech} onStop={stopListening} /> : null}
        <ReaderSettingsSheet
          open={openPanel === 'settings'}
          onOpenChange={onOpenChange('settings')}
          trigger={trigger}
        />
        {selected && !paragraph?.open && !openPanel ? (
          <ParagraphCommentFab
            // The player takes the bottom of the screen.
            placement={listening ? 'top' : selected.placement}
            onOpen={() => openParagraph(selected.pid, false)}
          />
        ) : null}
        <ParagraphCommentsSheet
          chapter={chapterRef}
          paragraph={paragraph}
          contentRef={contentRef}
          onClose={() => setParagraph((current) => current && { ...current, open: false })}
        />
      </div>
      {/* Outside the reading area, so the site colours apply rather than the reader preset's. */}
      {story.isMature ? (
        <MatureGate storyTitle={story.title} warningTags={story.warningTags} />
      ) : null}
    </>
  );
}
