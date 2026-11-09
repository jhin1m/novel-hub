import { m } from '@novel-hub/shared/messages';
import { useNavigate } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api-errors';
import { useCreateChapter, useMyChapters } from '@/lib/chapters';
import { FormMessage } from './auth-ui';
import { ChapterImportDialog } from './chapter-import/chapter-import-dialog';
import { ChapterListItem } from './write/chapter-list-item';

/** Chapters of a story in the writing area, with the button that starts the next one. */
export function ChapterList({ publicId }: { publicId: string }) {
  const chapters = useMyChapters(publicId);
  const create = useCreateChapter(publicId);
  const navigate = useNavigate();
  // Deleted chapters are not listed but keep their numbers, so this is a best guess for the
  // preview; the server assigns the real numbers.
  const nextNumber = Math.max(0, ...(chapters.data ?? []).map((chapter) => chapter.number)) + 1;

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
        <h2 id="chapter-list-title" className="text-xl leading-tight font-extrabold tracking-tight">
          {m.chapter_list_title()}
        </h2>
        <div className="flex flex-wrap gap-2">
          <ChapterImportDialog publicId={publicId} nextNumber={nextNumber} />
          <Button type="button" size="sm" onClick={addChapter} disabled={create.isPending}>
            <Plus />
            {m.chapter_add()}
          </Button>
        </div>
      </div>
      {create.isError ? <FormMessage>{apiErrorMessage(create.error)}</FormMessage> : null}
      {chapters.isPending ? (
        <p className="text-muted-foreground">{m.writer_loading()}</p>
      ) : chapters.isError ? (
        <FormMessage>{m.error_generic()}</FormMessage>
      ) : chapters.data.length === 0 ? (
        <p className="rounded-[18px] bg-secondary px-5 py-10 text-center text-muted-foreground">
          {m.chapter_list_empty()}
        </p>
      ) : (
        <ol className="flex flex-col gap-3">
          {chapters.data.map((chapter) => (
            <ChapterListItem key={chapter.number} publicId={publicId} chapter={chapter} />
          ))}
        </ol>
      )}
    </section>
  );
}
