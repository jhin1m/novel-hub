import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { FormMessage, textLinkClass } from '../../../components/auth-ui';
import { SiteLayout } from '../../../components/site-layout';
import { StoryForm } from '../../../components/story-form';
import { WriterGate } from '../../../components/writer-gate';
import { apiErrorMessage } from '../../../lib/api-errors';
import { useCreateStory, useTags } from '../../../lib/stories';

export const Route = createFileRoute('/write/stories/new')({
  head: () => ({
    meta: [{ title: m.story_new_title() }, { name: 'robots', content: 'noindex' }],
  }),
  component: NewStoryPage,
});

function NewStoryPage() {
  return (
    <SiteLayout>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
        <Link to="/write" className={textLinkClass}>
          {m.writer_back()}
        </Link>
        <h1 className="font-serif text-2xl font-semibold">{m.story_new_title()}</h1>
        <WriterGate>
          <NewStoryForm />
        </WriterGate>
      </div>
    </SiteLayout>
  );
}

function NewStoryForm() {
  const navigate = useNavigate();
  const tags = useTags();
  const create = useCreateStory();

  if (tags.isPending) return <p className="text-muted-foreground">{m.writer_loading()}</p>;
  if (tags.isError) return <FormMessage>{m.error_generic()}</FormMessage>;

  return (
    <StoryForm
      tags={tags.data}
      submitLabel={m.story_create_submit()}
      pending={create.isPending}
      onSubmit={(values) =>
        create.mutate(values, {
          onSuccess: (story) => {
            void navigate({ to: '/write/stories/$publicId', params: { publicId: story.publicId } });
          },
        })
      }
    >
      {create.isError ? <FormMessage>{apiErrorMessage(create.error)}</FormMessage> : null}
    </StoryForm>
  );
}
