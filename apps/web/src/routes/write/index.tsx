import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormMessage } from '../../components/auth-ui';
import { SiteLayout } from '../../components/site-layout';
import { STATUS_LABELS } from '../../components/story-form';
import { WriterGate } from '../../components/writer-gate';
import { type AuthorStoryView, useMyStories } from '../../lib/stories';

export const Route = createFileRoute('/write/')({
  head: () => ({
    meta: [{ title: m.writer_title() }, { name: 'robots', content: 'noindex' }],
  }),
  component: WriterHomePage,
});

export const VISIBILITY_LABELS: Record<AuthorStoryView['visibility'], () => string> = {
  draft: m.story_visibility_draft,
  published: m.story_visibility_published,
  hidden_by_mod: m.story_visibility_hidden_by_mod,
};

const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium' });

function WriterHomePage() {
  return (
    <SiteLayout>
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="font-serif text-2xl font-semibold">{m.writer_title()}</h1>
        </div>
        <WriterGate>
          <MyStories />
        </WriterGate>
      </div>
    </SiteLayout>
  );
}

function MyStories() {
  const stories = useMyStories();
  if (stories.isPending) return <p className="text-muted-foreground">{m.writer_loading()}</p>;
  if (stories.isError) return <FormMessage>{m.error_generic()}</FormMessage>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Button asChild>
          <Link to="/write/stories/new">{m.writer_new_story()}</Link>
        </Button>
      </div>
      {stories.data.length === 0 ? (
        <p className="text-muted-foreground">{m.writer_empty()}</p>
      ) : (
        <ul className="flex flex-col divide-y border-y">
          {stories.data.map((story) => (
            <li key={story.publicId} className="flex flex-col gap-1 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/write/stories/$publicId"
                  params={{ publicId: story.publicId }}
                  className="font-serif text-lg font-semibold underline-offset-4 hover:underline"
                >
                  {story.title}
                </Link>
                <Badge variant={story.visibility === 'published' ? 'default' : 'secondary'}>
                  {VISIBILITY_LABELS[story.visibility]()}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {[
                  STATUS_LABELS[story.status](),
                  m.writer_chapter_count({ count: String(story.chapterCount) }),
                  m.writer_updated_at({ date: dateFormat.format(new Date(story.updatedAt)) }),
                ].join(' · ')}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
