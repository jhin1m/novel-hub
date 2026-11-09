import { SEARCH_QUERY_MAX_LENGTH, type SearchQuery } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { SearchIcon } from 'lucide-react';
import { type FormEvent, useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { withFilters } from '@/lib/search';

/**
 * The search text. Starts from the URL query; submitting hands the query with the new text (the
 * chips' filters and order kept, first page) back to the page, which puts it in the URL. Parents
 * remount it (`key`) when the URL changes.
 */
export function SearchForm({
  query,
  onSubmit,
}: {
  query: SearchQuery;
  onSubmit: (query: SearchQuery) => void;
}) {
  const id = useId();
  const [q, setQ] = useState(query.q);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit(withFilters(query, { q: q.trim() }));
  };

  return (
    <form role="search" onSubmit={submit} className="flex gap-2">
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
    </form>
  );
}
