import { m } from '@novel-hub/shared/messages';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
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
import { type AuthorChapterView, useDeleteChapter } from '@/lib/chapters';
import { FormMessage } from '../auth-ui';

/**
 * Soft delete behind a confirmation. Deleting a published chapter leaves its number as a gap in
 * the story, which the warning spells out.
 */
export function DeleteChapterDialog({
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
        {/* Above the card link, which covers the whole item. */}
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          className="relative z-10 shrink-0 text-muted-foreground hover:text-destructive"
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
