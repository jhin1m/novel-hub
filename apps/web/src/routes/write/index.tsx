import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute } from '@tanstack/react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FormMessage } from '../../components/auth-ui';
import { SiteLayout } from '../../components/site-layout';
import { StoryCover } from '../../components/story-cover';
import { STATUS_LABELS } from '../../components/story-form';
import { WriterGate } from '../../components/writer-gate';
import { useMe } from '../../lib/me';
import { type AuthorStoryView, useMyStories } from '../../lib/stories';
import { seo } from '../../lib/seo';

export const Route = createFileRoute('/write/')({
  head: () => seo({ title: m.writer_title(), noindex: true }),
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
      <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-10">
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
  // Already loaded by `WriterGate`; every story here is by the signed-in author.
  const me = useMe();
  const stories = useMyStories();
  if (stories.isPending) return <p className="text-muted-foreground">{m.writer_loading()}</p>;
  if (stories.isError) return <FormMessage>{m.error_generic()}</FormMessage>;
  const authorName = me.data?.displayName ?? '';

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
        <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {stories.data.map((story) => (
            // The title link stretches over the whole card, so the cover is clickable too.
            <li key={story.publicId} className="relative flex flex-col gap-2">
              <StoryCover
                title={story.title}
                authorName={authorName}
                mainTagSlug={story.mainTag.slug}
                coverUrl={story.coverUrl}
                sizes="(min-width: 1024px) 180px, (min-width: 768px) 22vw, (min-width: 640px) 30vw, 45vw"
              />
              <Link
                to="/write/stories/$publicId"
                params={{ publicId: story.publicId }}
                className="line-clamp-2 font-serif font-semibold underline-offset-4 after:absolute after:inset-0 hover:underline"
              >
                {story.title}
              </Link>
              <div>
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
