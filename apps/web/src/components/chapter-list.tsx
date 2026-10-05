import { m } from '@novel-hub/shared/messages';
import { Link, useNavigate } from '@tanstack/react-router';
import { Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { apiErrorMessage } from '@/lib/api-errors';
import {
  type AuthorChapterView,
  useCreateChapter,
  useDeleteChapter,
  useMyChapters,
} from '@/lib/chapters';
import { FormMessage } from './auth-ui';
import { CHAPTER_STATUS_LABELS } from './story/story-labels';

const dateFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

/** Chapters of a story in the writing area, with the button that starts the next one. */
export function ChapterList({ publicId }: { publicId: string }) {
  const chapters = useMyChapters(publicId);
  const create = useCreateChapter(publicId);
  const navigate = useNavigate();

  const addChapter = () =>
    create.mutate(undefined, {
      onSuccess: (chapter) => {
        void navigate({
          to: '/write/stories/$publicId/chapters/$number',
          params: { publicId, number: String(chapter.number) },
        });
      },
    });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="chapter-list-title">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="chapter-list-title" className="font-serif text-xl font-semibold">
          {m.chapter_list_title()}
        </h2>
        <Button type="button" onClick={addChapter} disabled={create.isPending}>
          <Plus />
          {m.chapter_add()}
        </Button>
      </div>
      {create.isError ? <FormMessage>{apiErrorMessage(create.error)}</FormMessage> : null}
      {chapters.isPending ? (
        <p className="text-muted-foreground">{m.writer_loading()}</p>
      ) : chapters.isError ? (
        <FormMessage>{m.error_generic()}</FormMessage>
      ) : chapters.data.length === 0 ? (
        <p className="text-muted-foreground">{m.chapter_list_empty()}</p>
      ) : (
        <ol className="divide-y rounded-md border">
          {chapters.data.map((chapter) => (
            <li
              key={chapter.number}
              className="relative flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
            >
              <Link
                to="/write/stories/$publicId/chapters/$number"
                params={{ publicId, number: String(chapter.number) }}
                className="font-medium underline-offset-4 after:absolute after:inset-0 hover:underline"
              >
                {m.chapter_number({ number: String(chapter.number) })}
                {': '}
                <span className={chapter.title ? undefined : 'text-muted-foreground'}>
                  {chapter.title ?? m.chapter_untitled()}
                </span>
              </Link>
              <Badge variant={chapter.status === 'published' ? 'default' : 'secondary'}>
                {CHAPTER_STATUS_LABELS[chapter.status]()}
              </Badge>
              <span className="ml-auto text-sm text-muted-foreground">
                {m.chapter_updated_at({
                  date: dateFormat.format(new Date(chapter.draftUpdatedAt ?? chapter.updatedAt)),
                })}
              </span>
              {/* The API refuses to delete a chapter a moderator hid. */}
              {chapter.status === 'hidden_by_mod' ? null : (
                <DeleteChapterButton publicId={publicId} chapter={chapter} />
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * Soft delete behind a confirmation. Deleting a published chapter leaves its number as a gap in
 * the story, which the warning spells out.
 */
function DeleteChapterButton({
  publicId,
  chapter,
}: {
  publicId: string;
  chapter: AuthorChapterView;
}) {
  const [open, setOpen] = useState(false);
  const remove = useDeleteChapter(publicId);
  const number = String(chapter.number);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (remove.isPending) return;
        remove.reset();
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {/* Above the row link, which covers the whole item. */}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="relative z-10"
          aria-label={m.chapter_delete({ number })}
        >
          <Trash2 />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.chapter_delete_title({ number })}</DialogTitle>
          <DialogDescription>
            {chapter.status === 'published'
              ? m.chapter_delete_published_warning({ number })
              : m.chapter_delete_draft_warning()}
          </DialogDescription>
        </DialogHeader>
        {remove.isError ? <FormMessage>{apiErrorMessage(remove.error)}</FormMessage> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={remove.isPending}>
              {m.publish_cancel()}
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate(chapter.number, { onSuccess: () => setOpen(false) })}
          >
            {m.chapter_delete_confirm()}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
