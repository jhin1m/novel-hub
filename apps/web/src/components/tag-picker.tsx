import { LIMITS, TAG_KINDS, type TagKind } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useId } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { TagView } from '@/lib/stories';

const KIND_LABELS: Record<TagKind, () => string> = {
  genre: m.story_tag_kind_genre,
  theme: m.story_tag_kind_theme,
  warning: m.story_tag_kind_warning,
};

/** Number of tags the story will have: the main tag plus the other selected ones. */
export function countTags(mainTag: string, selected: readonly string[]): number {
  return (mainTag ? 1 : 0) + selected.filter((slug) => slug !== mainTag).length;
}

/**
 * Main genre (required) plus extra tags grouped by kind, capped at `LIMITS.storyTagsMax` in
 * total. The main tag is not offered again in the extra list.
 */
export function TagPicker({
  tags,
  mainTag,
  onMainTagChange,
  selected,
  onSelectedChange,
  mainTagError,
  tagsError,
}: {
  tags: TagView[];
  mainTag: string;
  onMainTagChange: (slug: string) => void;
  selected: string[];
  onSelectedChange: (slugs: string[]) => void;
  mainTagError?: string | undefined;
  tagsError?: string | undefined;
}) {
  const id = useId();
  const total = countTags(mainTag, selected);
  const full = total >= LIMITS.storyTagsMax;
  const genres = tags.filter((t) => t.kind === 'genre');

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-main`}>{m.story_main_tag_label()}</Label>
        <Select
          value={mainTag}
          onValueChange={(slug) => {
            onMainTagChange(slug);
            onSelectedChange(selected.filter((s) => s !== slug));
          }}
        >
          <SelectTrigger
            id={`${id}-main`}
            className="w-full sm:w-64"
            aria-invalid={mainTagError ? true : undefined}
            aria-describedby={mainTagError ? `${id}-main-error` : undefined}
          >
            <SelectValue placeholder={m.story_main_tag_placeholder()} />
          </SelectTrigger>
          <SelectContent>
            {genres.map((tag) => (
              <SelectItem key={tag.slug} value={tag.slug}>
                {tag.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mainTagError ? <FieldError id={`${id}-main-error`}>{mainTagError}</FieldError> : null}
      </div>

      <fieldset className="flex flex-col gap-4" aria-describedby={`${id}-count`}>
        <legend className="text-sm font-medium">{m.story_tags_label()}</legend>
        <p id={`${id}-count`} className="-mt-2 text-sm text-muted-foreground">
          {m.story_tags_count({ count: String(total), max: String(LIMITS.storyTagsMax) })}
        </p>
        {TAG_KINDS.map((kind) => {
          const group = tags.filter((t) => t.kind === kind && t.slug !== mainTag);
          if (group.length === 0) return null;
          return (
            <div key={kind} className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{KIND_LABELS[kind]()}</p>
              <ul className="flex flex-wrap gap-x-5 gap-y-2">
                {group.map((tag) => {
                  const checked = selected.includes(tag.slug);
                  const boxId = `${id}-tag-${tag.slug}`;
                  return (
                    <li key={tag.slug} className="flex items-center gap-2">
                      <Checkbox
                        id={boxId}
                        checked={checked}
                        disabled={!checked && full}
                        onCheckedChange={(value) =>
                          onSelectedChange(
                            value === true
                              ? [...selected, tag.slug]
                              : selected.filter((s) => s !== tag.slug),
                          )
                        }
                      />
                      <Label htmlFor={boxId} className="font-normal">
                        {tag.name}
                      </Label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {tagsError ? <FieldError>{tagsError}</FieldError> : null}
      </fieldset>
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: string }) {
  return (
    <p id={id} className="text-sm text-destructive">
      {children}
    </p>
  );
}
