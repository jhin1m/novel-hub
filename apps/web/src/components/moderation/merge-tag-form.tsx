import { TAG_KINDS } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api-errors';
import { useModerationAction } from '@/lib/moderation';
import { type TagView, tagsQueryKey, useTags } from '@/lib/stories';
import { cn } from '@/lib/utils';
import { pageCardClass } from '../page-shell';
import { TAG_KIND_LABELS } from '../story/story-labels';
import { ConfirmDialog } from './confirm-dialog';

function TagSelect({
  id,
  tags,
  value,
  onChange,
}: {
  id: string;
  tags: TagView[];
  value: string;
  onChange: (slug: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full sm:w-72">
        <SelectValue placeholder={m.moderation_merge_pick()} />
      </SelectTrigger>
      <SelectContent>
        {TAG_KINDS.map((kind) => {
          const ofKind = tags.filter((tag) => tag.kind === kind);
          if (ofKind.length === 0) return null;
          return (
            <SelectGroup key={kind}>
              <SelectLabel>{TAG_KIND_LABELS[kind]()}</SelectLabel>
              {ofKind.map((tag) => (
                <SelectItem key={tag.slug} value={tag.slug}>
                  {tag.name}
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

/**
 * Merges one canonical tag into another of the same kind. The target list only offers tags of the
 * source's kind; the server checks it again. Asks for confirmation (there is no undo button).
 */
export function MergeTagForm() {
  const id = useId();
  const queryClient = useQueryClient();
  const tags = useTags();
  const act = useModerationAction();
  const [source, setSource] = useState('');
  const [target, setTarget] = useState('');

  if (tags.isPending) return <p role="status">{m.moderation_loading()}</p>;
  if (tags.isError) return <p role="alert">{m.error_generic()}</p>;

  const all = tags.data;
  const sourceTag = all.find((tag) => tag.slug === source);
  const targetTag = all.find((tag) => tag.slug === target);
  const targets = sourceTag
    ? all.filter((tag) => tag.kind === sourceTag.kind && tag.slug !== sourceTag.slug)
    : [];

  return (
    <section className={cn(pageCardClass, 'flex max-w-[560px] flex-col gap-4')}>
      <p className="text-muted-foreground">{m.moderation_merge_intro()}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-source`}>{m.moderation_merge_source()}</Label>
        <TagSelect
          id={`${id}-source`}
          tags={all}
          value={source}
          onChange={(slug) => {
            setSource(slug);
            setTarget('');
            act.reset();
          }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-target`}>{m.moderation_merge_target()}</Label>
        <TagSelect id={`${id}-target`} tags={targets} value={target} onChange={setTarget} />
      </div>
      <div>
        <ConfirmDialog
          trigger={
            <Button disabled={!sourceTag || !targetTag || act.isPending}>
              {m.moderation_action_merge_tag()}
            </Button>
          }
          title={m.moderation_confirm_merge_title({
            source: sourceTag?.name ?? '',
            target: targetTag?.name ?? '',
          })}
          description={m.moderation_confirm_merge_description({
            source: sourceTag?.name ?? '',
            target: targetTag?.name ?? '',
          })}
          onConfirm={() =>
            act.mutate(
              { action: 'merge_tag', sourceSlug: source, targetSlug: target },
              {
                onSuccess: () => {
                  setSource('');
                  setTarget('');
                  void queryClient.invalidateQueries({ queryKey: tagsQueryKey });
                },
              },
            )
          }
        />
      </div>
      {act.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {apiErrorMessage(act.error)}
        </p>
      ) : null}
      {act.isSuccess ? (
        <p role="status" className="text-sm text-muted-foreground">
          {m.moderation_done()}
        </p>
      ) : null}
    </section>
  );
}
