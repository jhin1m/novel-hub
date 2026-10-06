import { m } from '@novel-hub/shared/messages';
import { ArrowLeft } from 'lucide-react';
import { FormMessage } from '@/components/auth-ui';
import { Button } from '@/components/ui/button';
import { type RevisionSummary, useRevisionPreview } from '@/lib/chapters';
import { wordCountText } from './chapter-editor-helpers';

export const revisionDateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
});

/**
 * One published version, read-only, with the way back to the list and the restore action. It
 * fetches its own HTML so the only markup it can show is what the server rendered and sanitized.
 */
export function RevisionPreview({
  publicId,
  number,
  revision,
  pending,
  onRestoreClick,
  onBack,
}: {
  publicId: string;
  number: number;
  revision: RevisionSummary;
  pending: boolean;
  onRestoreClick: () => void;
  onBack: () => void;
}) {
  const preview = useRevisionPreview(publicId, number, revision.key);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={onBack}>
          <ArrowLeft />
          {m.revision_back()}
        </Button>
        <span className="text-sm text-muted-foreground">
          {revisionDateTime.format(new Date(revision.createdAt))} ·{' '}
          {wordCountText(revision.wordCount)}
        </span>
        <Button
          type="button"
          size="sm"
          className="ml-auto"
          disabled={pending || !preview.data}
          onClick={onRestoreClick}
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
          className="chapter-preview-content font-serif text-[18px] leading-[1.85]"
          // Rendered and sanitized on the server from the stored document.
          dangerouslySetInnerHTML={{ __html: preview.data.html }}
        />
      )}
    </>
  );
}
