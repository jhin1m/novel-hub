import { m } from '@novel-hub/shared/messages';
import { ArrowLeft, History } from 'lucide-react';
import { useState } from 'react';
import { FormMessage } from '@/components/auth-ui';
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
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { type RevisionSummary, useRevisionPreview, useRevisions } from '@/lib/chapters';

const dateTimeFormat = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' });

const formatWords = (count: number) =>
  m.editor_word_count({ count: count.toLocaleString('vi-VN') });

/**
 * Published versions of a chapter: browse, preview, restore into the draft. The restore itself
 * (pausing autosave, swapping the editor content) belongs to the editor; `onRestore` resolves with
 * an error message to show here, or null once done, which closes the sheet.
 */
export function RevisionHistorySheet({
  publicId,
  number,
  onRestore,
}: {
  publicId: string;
  number: number;
  onRestore: (revision: RevisionSummary) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revisions = useRevisions(publicId, number, open);
  const preview = useRevisionPreview(publicId, number, open ? selectedKey : null);
  const selected = revisions.data?.find((revision) => revision.key === selectedKey) ?? null;

  const onOpenChange = (next: boolean) => {
    if (pending) return;
    if (next) {
      setSelectedKey(null);
      setError(null);
    }
    setOpen(next);
  };

  const restore = async () => {
    if (!selected) return;
    setPending(true);
    setError(null);
    const failure = await onRestore(selected);
    setPending(false);
    setConfirming(false);
    if (failure === null) setOpen(false);
    else setError(failure);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={m.revision_history()}
          title={m.revision_history()}
        >
          <History />
          <span className="hidden sm:inline">{m.revision_history()}</span>
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{m.revision_history_title()}</SheetTitle>
          <SheetDescription>{m.revision_history_description()}</SheetDescription>
        </SheetHeader>
        <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
          {error ? <FormMessage>{error}</FormMessage> : null}
          {selected ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    setSelectedKey(null);
                    setError(null);
                  }}
                >
                  <ArrowLeft />
                  {m.revision_back()}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {dateTimeFormat.format(new Date(selected.createdAt))} ·{' '}
                  {formatWords(selected.wordCount)}
                </span>
                <Button
                  type="button"
                  size="sm"
                  className="ml-auto"
                  disabled={pending || !preview.data}
                  onClick={() => setConfirming(true)}
                >
                  {m.revision_restore()}
                </Button>
              </div>
              {preview.isPending ? (
                <p className="text-sm text-muted-foreground">{m.revision_loading()}</p>
              ) : preview.isError ? (
                <FormMessage>{m.revision_load_failed()}</FormMessage>
              ) : (
                <article
                  className="chapter-preview-content font-serif text-lg leading-[1.85]"
                  // Rendered and sanitized on the server from the stored document.
                  dangerouslySetInnerHTML={{ __html: preview.data.html }}
                />
              )}
            </>
          ) : revisions.isPending ? (
            <p className="text-sm text-muted-foreground">{m.revision_loading()}</p>
          ) : revisions.isError ? (
            <FormMessage>{m.revision_load_failed()}</FormMessage>
          ) : revisions.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">{m.revision_empty()}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {revisions.data.map((revision) => (
                <li key={revision.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedKey(revision.key);
                      setError(null);
                    }}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="font-medium">
                      {dateTimeFormat.format(new Date(revision.createdAt))}
                    </span>
                    <span className="text-muted-foreground">{formatWords(revision.wordCount)}</span>
                    {revision.isPublished ? (
                      <Badge variant="secondary" className="ml-auto">
                        {m.revision_published_badge()}
                      </Badge>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <Dialog
          open={confirming}
          onOpenChange={(next) => {
            if (!pending) setConfirming(next);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{m.revision_restore_confirm_title()}</DialogTitle>
              <DialogDescription>{m.revision_restore_confirm_body()}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" disabled={pending}>
                  {m.revision_cancel()}
                </Button>
              </DialogClose>
              <Button type="button" disabled={pending} onClick={() => void restore()}>
                {pending ? m.revision_restore_pending() : m.revision_restore_confirm()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  );
}
