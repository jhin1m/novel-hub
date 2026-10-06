import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { FormMessage, textLinkClass } from '../../../components/auth-ui';
import { PageShell, PageTitle, pageCardClass } from '../../../components/page-shell';
import { SiteLayout } from '../../../components/site-layout';
import { StoryForm } from '../../../components/story-form';
import { WriterGate } from '../../../components/writer-gate';
import { apiErrorMessage } from '../../../lib/api-errors';
import { useCreateStory, useTags } from '../../../lib/stories';
import { seo } from '../../../lib/seo';

export const Route = createFileRoute('/write/stories/new')({
  head: () => seo({ title: m.story_new_title(), noindex: true }),
  component: NewStoryPage,
});

function NewStoryPage() {
  return (
    <SiteLayout>
      <PageShell width="narrow" className="max-w-[720px]">
        <Link to="/write" className={textLinkClass}>
          {m.writer_back()}
        </Link>
        <PageTitle>{m.story_new_title()}</PageTitle>
        <WriterGate>
          <div className={pageCardClass}>
            <NewStoryForm />
          </div>
        </WriterGate>
      </PageShell>
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
