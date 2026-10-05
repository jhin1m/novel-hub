import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute } from '@tanstack/react-router';
import { FormMessage, textLinkClass } from '../../../../components/auth-ui';
import { CoverUpload } from '../../../../components/cover-upload';
import { SiteLayout } from '../../../../components/site-layout';
import { StoryForm } from '../../../../components/story-form';
import { WriterGate } from '../../../../components/writer-gate';
import { ApiError, apiErrorMessage } from '../../../../lib/api-errors';
import {
  type AuthorStoryView,
  type TagView,
  useMyStory,
  useTags,
  useUpdateStory,
} from '../../../../lib/stories';

export const Route = createFileRoute('/write/stories/$publicId/')({
  head: () => ({
    meta: [{ title: m.story_edit_title() }, { name: 'robots', content: 'noindex' }],
  }),
  component: EditStoryPage,
});

function EditStoryPage() {
  return (
    <SiteLayout>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <Link to="/write" className={textLinkClass}>
          {m.writer_back()}
        </Link>
        <h1 className="font-serif text-2xl font-semibold">{m.story_edit_title()}</h1>
        <WriterGate>
          <EditStory />
        </WriterGate>
      </div>
    </SiteLayout>
  );
}

function EditStory() {
  const { publicId } = Route.useParams();
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

  return (
    <div className="flex flex-col gap-10">
      <CoverUpload story={story.data} />
      <EditStoryForm key={story.data.publicId} story={story.data} tags={tags.data} />
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
