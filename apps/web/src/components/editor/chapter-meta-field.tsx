import { LIMITS } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { type FocusEvent, useId, useRef, useState } from 'react';
import { FormMessage } from '@/components/auth-ui';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api-errors';
import { useUpdateChapterMeta } from '@/lib/chapters';
import { cn } from '@/lib/utils';

/**
 * Title or author note, saved on blur when changed. Plain text: shown through React, so it is
 * escaped on display.
 */
export function ChapterMetaField({
  kind,
  publicId,
  number,
  initial,
}: {
  kind: 'title' | 'authorNote';
  publicId: string;
  number: number;
  initial: string | null;
}) {
  const id = useId();
  const update = useUpdateChapterMeta(publicId, number);
  const savedRef = useRef(initial ?? '');
  const [value, setValue] = useState(initial ?? '');

  const onBlur = (event: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const next = event.currentTarget.value.trim();
    if (next === savedRef.current) return;
    update.mutate(
      { [kind]: next === '' ? null : next },
      {
        onSuccess: (chapter) => {
          savedRef.current = chapter[kind] ?? '';
        },
      },
    );
  };

  const error = update.isError ? <FormMessage>{apiErrorMessage(update.error)}</FormMessage> : null;

  if (kind === 'title') {
    return (
      <div className="flex flex-col gap-1">
        <Label htmlFor={id} className="sr-only">
          {m.editor_title_label()}
        </Label>
        <Input
          id={id}
          value={value}
          maxLength={LIMITS.chapterTitleMax}
          placeholder={m.editor_title_placeholder()}
          onChange={(e) => setValue(e.target.value)}
          onBlur={onBlur}
          className={cn(
            'h-auto rounded-none border-0 bg-transparent px-0 py-1 shadow-none',
            'font-serif text-[26px] leading-tight font-bold md:text-[36px]',
            'focus-visible:ring-0 dark:bg-transparent',
          )}
        />
        {error}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-[20px] bg-card p-5">
      <Label htmlFor={id}>{m.editor_author_note_label()}</Label>
      <Textarea
        id={id}
        value={value}
        maxLength={LIMITS.authorNoteMax}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onBlur}
        aria-describedby={`${id}-hint`}
        className="min-h-24 bg-background"
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {m.editor_author_note_hint()}
      </p>
      {error}
    </div>
  );
}
