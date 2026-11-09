import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute } from '@tanstack/react-router';
import { AnnouncementManager } from '../../../../components/announcements/announcement-manager';
import { FormMessage, textLinkClass } from '../../../../components/auth-ui';
import { ChapterList } from '../../../../components/chapter-list';
import { ContestEntryPanel } from '../../../../components/contests/contest-entry-panel';
import { CoverUpload } from '../../../../components/cover-upload';
import { PageShell, PageTitle, pageCardClass } from '../../../../components/page-shell';
import { SiteLayout } from '../../../../components/site-layout';
import { StoryForm } from '../../../../components/story-form';
import { StoryManageHeader } from '../../../../components/write/story-manage-header';
import { WriterGate } from '../../../../components/writer-gate';
import { ApiError, apiErrorMessage } from '../../../../lib/api-errors';
import { useMe } from '../../../../lib/me';
import { cn } from '../../../../lib/utils';
import {
  type AuthorStoryView,
  type TagView,
  useMyStory,
  useTags,
  useUpdateStory,
} from '../../../../lib/stories';
import { seo } from '../../../../lib/seo';

export const Route = createFileRoute('/write/stories/$publicId/')({
  head: () => seo({ title: m.story_edit_title(), noindex: true }),
  component: EditStoryPage,
});

function EditStoryPage() {
  return (
    <SiteLayout>
      <PageShell>
        <Link to="/write" className={textLinkClass}>
          {m.writer_back()}
        </Link>
        <PageTitle>{m.story_edit_title()}</PageTitle>
        <WriterGate>
          <EditStory />
        </WriterGate>
      </PageShell>
    </SiteLayout>
  );
}

function EditStory() {
  const { publicId } = Route.useParams();
  // Already loaded by `WriterGate`; the author is the signed-in account.
  const me = useMe();
  const story = useMyStory(publicId);
  const tags = useTags();

  if (story.isPending || tags.isPending) {
    return <p className="text-muted-foreground">{m.writer_loading()}</p>;
  }
  if (story.isError) {
    const missing =
      story.error instanceof ApiError && (story.error.status === 404 || story.error.status === 403);
    return <FormMessage>{missing ? m.story_not_found() : m.error_generic()}</FormMessage>;
  }
  if (tags.isError) return <FormMessage>{m.error_generic()}</FormMessage>;

  // DOM order is the phone order (band, chapters, contests, cover, announcements, form); from `lg` the cover
  // card moves up beside the chapters and the rest flows, full width, into the rows under them.
  return (
    <div className="flex flex-col gap-8">
      <StoryManageHeader story={story.data} />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <ChapterList publicId={story.data.publicId} />
        </div>
        {/* Empty when no contest is open: hidden, so it takes no row and no gap. */}
        <div className="empty:hidden lg:col-span-2">
          <ContestEntryPanel publicId={story.data.publicId} />
        </div>
        {/* The cover card's row layout needs more than 340px, so it stacks there. */}
        <div
          className={cn(
            pageCardClass,
            'self-start lg:col-start-2 lg:row-start-1 lg:p-6 lg:[&_section>div]:flex-col',
          )}
        >
          <CoverUpload story={story.data} authorName={me.data?.displayName ?? ''} />
        </div>
        <div className="empty:hidden lg:col-span-2">
          <AnnouncementManager
            publicId={story.data.publicId}
            canPost={story.data.visibility === 'published' && story.data.lastChapterAt !== null}
          />
        </div>
        <div className={cn(pageCardClass, 'lg:col-span-2')}>
          <div className="max-w-[720px]">
            <EditStoryForm key={story.data.publicId} story={story.data} tags={tags.data} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Fields start from the story as first loaded and are not reset by later refetches (a cover upload
 * also bumps `updatedAt`), so unsaved edits survive.
 */
function EditStoryForm({ story, tags }: { story: AuthorStoryView; tags: TagView[] }) {
  const update = useUpdateStory(story.publicId);
  return (
    <StoryForm
      story={story}
      tags={tags}
      submitLabel={m.story_save_submit()}
      pending={update.isPending}
      onSubmit={(values) => update.mutate(values)}
    >
      {update.isError ? <FormMessage>{apiErrorMessage(update.error)}</FormMessage> : null}
      {update.isSuccess ? <FormMessage tone="info">{m.story_saved()}</FormMessage> : null}
    </StoryForm>
  );
}
