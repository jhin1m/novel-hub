import { m } from '@novel-hub/shared/messages';
import { History } from 'lucide-react';
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
import { type RevisionSummary, useRevisions } from '@/lib/chapters';
import { wordCountText } from './chapter-editor-helpers';
import { RevisionPreview, revisionDateTime } from './revision-preview';

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
          <span className="hidden md:inline">{m.revision_history()}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="adaptive-right" className="gap-0 max-lg:h-[90dvh] lg:max-w-[560px]">
        <SheetHeader className="border-b">
          <SheetTitle>{m.revision_history_title()}</SheetTitle>
          <SheetDescription>{m.revision_history_description()}</SheetDescription>
        </SheetHeader>
        <div className="flex grow flex-col gap-4 overflow-y-auto p-4">
          {error ? <FormMessage>{error}</FormMessage> : null}
          {selected ? (
            <RevisionPreview
              publicId={publicId}
              number={number}
              revision={selected}
              pending={pending}
              onRestoreClick={() => setConfirming(true)}
              onBack={() => {
                setSelectedKey(null);
                setError(null);
              }}
            />
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
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border bg-background px-4 py-3 text-left text-sm hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <span className="font-bold">
                      {revisionDateTime.format(new Date(revision.createdAt))}
                    </span>
                    <span className="text-muted-foreground">
                      {wordCountText(revision.wordCount)}
                    </span>
                    {revision.isPublished ? (
                      <Badge variant="default" className="ml-auto">
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
