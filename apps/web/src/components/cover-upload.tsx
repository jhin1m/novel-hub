import { COVER_MIME_TYPES, LIMITS } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api-errors';
import { type AuthorStoryView, useRemoveCover, useUploadCover } from '@/lib/stories';
import { FormMessage } from './auth-ui';
import { StoryCover } from './story-cover';

const ACCEPTED: readonly string[] = COVER_MIME_TYPES;

/**
 * Cover picker with a local preview. Type and size are checked here first to save an upload; the
 * server checks again from the file contents (and the minimum dimensions).
 */
export function CoverUpload({ story, authorName }: { story: AuthorStoryView; authorName: string }) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const previewRef = useRef<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const upload = useUploadCover(story.publicId);
  const remove = useRemoveCover(story.publicId);

  // Object URLs keep the file in memory until revoked: on a new pick and on unmount.
  const selectFile = (next: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : null;
    setPreview(previewRef.current);
    setFile(next);
  };
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const clearSelection = () => {
    selectFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const busy = upload.isPending || remove.isPending;
  const error =
    localError ??
    (upload.isError ? apiErrorMessage(upload.error) : null) ??
    (remove.isError ? apiErrorMessage(remove.error) : null);

  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-4">
      <h2 id={`${id}-title`} className="font-serif text-xl font-semibold">
        {m.cover_title()}
      </h2>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex w-40 shrink-0 flex-col gap-2">
          {preview ? (
            <img
              src={preview}
              alt={m.cover_preview_alt()}
              className="aspect-[2/3] w-full rounded-md bg-muted object-cover"
            />
          ) : (
            <StoryCover
              title={story.title}
              authorName={authorName}
              mainTagSlug={story.mainTag.slug}
              coverUrl={story.coverUrl}
              sizes="160px"
            />
          )}
          {!preview && !story.coverUrl ? (
            <p className="text-center text-sm text-muted-foreground">{m.cover_none()}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-3">
          <label htmlFor={`${id}-file`} className="text-sm font-medium">
            {m.cover_choose()}
          </label>
          <input
            ref={inputRef}
            id={`${id}-file`}
            type="file"
            accept={COVER_MIME_TYPES.join(',')}
            aria-describedby={`${id}-hint`}
            className="text-sm file:mr-3 file:rounded-md file:border file:border-input file:bg-transparent file:px-3 file:py-1.5 file:text-sm"
            onChange={(e) => {
              const picked = e.currentTarget.files?.[0] ?? null;
              upload.reset();
              remove.reset();
              setLocalError(null);
              if (picked && !ACCEPTED.includes(picked.type)) {
                setLocalError(m.error_unsupported_image());
                clearSelection();
              } else if (picked && picked.size > LIMITS.cover.maxBytes) {
                setLocalError(m.error_file_too_large());
                clearSelection();
              } else {
                selectFile(picked);
              }
            }}
          />
          <p id={`${id}-hint`} className="text-sm text-muted-foreground">
            {m.cover_hint()}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={!file || busy}
              onClick={() => {
                if (!file) return;
                upload.mutate(file, { onSuccess: clearSelection });
              }}
            >
              {upload.isPending ? m.auth_submitting() : m.cover_upload()}
            </Button>
            {story.coverUrl ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  upload.reset();
                  remove.mutate();
                }}
              >
                {m.cover_remove()}
              </Button>
            ) : null}
          </div>
          {error ? <FormMessage>{error}</FormMessage> : null}
          {upload.isSuccess ? <FormMessage tone="info">{m.cover_uploaded()}</FormMessage> : null}
          {remove.isSuccess ? <FormMessage tone="info">{m.cover_removed()}</FormMessage> : null}
        </div>
      </div>
    </section>
  );
}
