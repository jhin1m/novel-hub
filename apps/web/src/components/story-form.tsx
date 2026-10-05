import {
  LIMITS,
  STORY_STATUSES,
  type StoryCreateInput,
  type StoryStatus,
  storyCreateSchema,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { type ReactNode, useId, useState } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formText } from '@/lib/form-text';
import type { AuthorStoryView, TagView } from '@/lib/stories';
import { SubmitButton } from './auth-ui';
import { FieldError, TagPicker, countTags } from './tag-picker';

export type StoryFormValues = StoryCreateInput & { status?: StoryStatus };

type FieldName = 'title' | 'synopsis' | 'mainTag' | 'tags';

const FIELD_ERRORS: Record<FieldName, () => string> = {
  title: m.story_error_title,
  synopsis: m.story_error_synopsis,
  mainTag: m.story_error_main_tag,
  tags: m.story_error_tags,
};

export const STATUS_LABELS: Record<StoryStatus, () => string> = {
  ongoing: m.story_status_ongoing,
  completed: m.story_status_completed,
  hiatus: m.story_status_hiatus,
};

/**
 * Create/edit form for story metadata. Validates with the same Zod schema as the API before
 * sending, so field errors show without a round trip. `story` switches it to edit mode (adds the
 * status field).
 */
export function StoryForm({
  tags,
  story,
  submitLabel,
  pending,
  onSubmit,
  children,
}: {
  tags: TagView[];
  story?: AuthorStoryView;
  submitLabel: string;
  pending: boolean;
  onSubmit: (values: StoryFormValues) => void;
  /** Request outcome (error or success message) shown above the submit button. */
  children?: ReactNode;
}) {
  const id = useId();
  const [mainTag, setMainTag] = useState(story?.mainTag.slug ?? '');
  const [selected, setSelected] = useState(story?.tags.map((t) => t.slug) ?? []);
  const [isMature, setIsMature] = useState(story?.isMature ?? false);
  const [isAiAssisted, setIsAiAssisted] = useState(story?.isAiAssisted ?? false);
  const [status, setStatus] = useState<StoryStatus>(story?.status ?? 'ongoing');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});

  const describedBy = (field: FieldName, hint?: boolean) =>
    [hint ? `${id}-${field}-hint` : '', errors[field] ? `${id}-${field}-error` : '']
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <form
      method="post"
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const parsed = storyCreateSchema.safeParse({
          title: formText(form, 'title'),
          synopsis: formText(form, 'synopsis'),
          mainTag,
          tags: selected.filter((slug) => slug !== mainTag),
          isMature,
          isAiAssisted,
        });
        const tooManyTags = countTags(mainTag, selected) > LIMITS.storyTagsMax;
        if (!parsed.success || tooManyTags) {
          const next: Partial<Record<FieldName, string>> = {};
          if (tooManyTags) next.tags = FIELD_ERRORS.tags();
          for (const issue of parsed.success ? [] : parsed.error.issues) {
            const field = issue.path[0];
            if (typeof field === 'string' && field in FIELD_ERRORS) {
              next[field as FieldName] ??= FIELD_ERRORS[field as FieldName]();
            }
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSubmit(story ? { ...parsed.data, status } : parsed.data);
      }}
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-title`}>{m.story_title_label()}</Label>
        <Input
          id={`${id}-title`}
          name="title"
          defaultValue={story?.title}
          maxLength={LIMITS.storyTitle.max}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={describedBy('title', true)}
        />
        <p id={`${id}-title-hint`} className="text-sm text-muted-foreground">
          {m.story_title_hint()}
        </p>
        {errors.title ? <FieldError id={`${id}-title-error`}>{errors.title}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-synopsis`}>{m.story_synopsis_label()}</Label>
        <Textarea
          id={`${id}-synopsis`}
          name="synopsis"
          rows={6}
          defaultValue={story?.synopsis}
          maxLength={LIMITS.storySynopsisMax}
          aria-invalid={errors.synopsis ? true : undefined}
          aria-describedby={describedBy('synopsis', true)}
        />
        <p id={`${id}-synopsis-hint`} className="text-sm text-muted-foreground">
          {m.story_synopsis_hint()}
        </p>
        {errors.synopsis ? (
          <FieldError id={`${id}-synopsis-error`}>{errors.synopsis}</FieldError>
        ) : null}
      </div>

      <TagPicker
        tags={tags}
        mainTag={mainTag}
        onMainTagChange={setMainTag}
        selected={selected}
        onSelectedChange={setSelected}
        mainTagError={errors.mainTag}
        tagsError={errors.tags}
      />

      {story ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-status`}>{m.story_status_label()}</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as StoryStatus)}>
            <SelectTrigger id={`${id}-status`} className="w-full sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STORY_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {STATUS_LABELS[value]()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-mature`}
            checked={isMature}
            onCheckedChange={(value) => setIsMature(value === true)}
          />
          <Label htmlFor={`${id}-mature`} className="font-normal">
            {m.story_mature_label()}
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${id}-ai`}
            checked={isAiAssisted}
            onCheckedChange={(value) => setIsAiAssisted(value === true)}
          />
          <Label htmlFor={`${id}-ai`} className="font-normal">
            {m.story_ai_label()}
          </Label>
        </div>
      </div>

      {children}
      <div>
        <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
