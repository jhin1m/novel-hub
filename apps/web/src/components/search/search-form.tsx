import type { TagView } from '@novel-hub/core';
import {
  STORY_STATUSES,
  SEARCH_QUERY_MAX_LENGTH,
  type SearchQuery,
  type StoryStatus,
  WORD_RANGES,
  type WordRangeKey,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { SearchIcon } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { wordBounds, wordRangeOf } from '@/lib/search';
import { STORY_STATUS_LABELS } from '../story/story-labels';

/** Radix Select has no empty value, so "any" is its own item. */
const ANY = 'any';

const WORD_RANGE_LABELS: Record<WordRangeKey, () => string> = {
  short: m.search_words_short,
  medium: m.search_words_medium,
  long: m.search_words_long,
  epic: m.search_words_epic,
};

/**
 * Search text and filters. Starts from the URL query; submitting hands a new query (first page)
 * back to the page, which puts it in the URL. Parents remount it (`key`) when the URL changes.
 */
export function SearchForm({
  query,
  genres,
  onSubmit,
}: {
  query: SearchQuery;
  genres: TagView[];
  onSubmit: (query: SearchQuery) => void;
}) {
  const id = useId();
  const [q, setQ] = useState(query.q);
  const [tag, setTag] = useState(query.tag ?? ANY);
  const [status, setStatus] = useState<StoryStatus | typeof ANY>(query.status ?? ANY);
  const [words, setWords] = useState<WordRangeKey | typeof ANY>(wordRangeOf(query) ?? ANY);

  const tagItems = genres.map((genre) => ({ value: genre.slug, label: genre.name }));
  // A tag from a link that is not a genre (a theme, say) still filters and stays selectable.
  if (query.tag !== undefined && !tagItems.some((item) => item.value === query.tag)) {
    tagItems.push({ value: query.tag, label: query.tag });
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const range = words === ANY ? undefined : words;
    onSubmit({
      q: q.trim(),
      tag: tag === ANY ? undefined : tag,
      status: status === ANY ? undefined : status,
      // A custom range from the URL survives until the reader picks one in the form.
      ...(range === undefined && wordRangeOf(query) === undefined
        ? { minWords: query.minWords, maxWords: query.maxWords }
        : wordBounds(range)),
      page: 1,
    });
  };

  return (
    <form role="search" onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Label htmlFor={`${id}-q`} className="sr-only">
          {m.search_query_label()}
        </Label>
        <Input
          id={`${id}-q`}
          type="search"
          value={q}
          maxLength={SEARCH_QUERY_MAX_LENGTH}
          placeholder={m.layout_search_placeholder()}
          onChange={(event) => setQ(event.target.value)}
          className="flex-1"
        />
        <Button type="submit">
          <SearchIcon aria-hidden />
          {m.search_submit()}
        </Button>
      </div>
      <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <legend className="sr-only">{m.search_filters()}</legend>
        <FilterSelect
          id={`${id}-tag`}
          label={m.search_tag_label()}
          value={tag}
          onChange={setTag}
          items={tagItems}
        />
        <FilterSelect
          id={`${id}-status`}
          label={m.story_status_label()}
          value={status}
          onChange={(value) => setStatus(value as StoryStatus | typeof ANY)}
          items={STORY_STATUSES.map((value) => ({
            value,
            label: STORY_STATUS_LABELS[value](),
          }))}
        />
        <FilterSelect
          id={`${id}-words`}
          label={m.search_words_label()}
          value={words}
          onChange={(value) => setWords(value as WordRangeKey | typeof ANY)}
          items={WORD_RANGES.map((range) => ({
            value: range.key,
            label: WORD_RANGE_LABELS[range.key](),
          }))}
        />
      </fieldset>
    </form>
  );
}

function FilterSelect({
  id,
  label,
  value,
  onChange,
  items,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY}>{m.search_any()}</SelectItem>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
