import { m } from '@novel-hub/shared/messages';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Previous/next links of a paged public list; `href` comes from `canonicalPath`. */
export function Pagination({
  page,
  totalPages,
  href,
}: {
  page: number;
  totalPages: number;
  href: (page: number) => string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label={m.pagination_label()} className="flex items-center justify-between gap-4">
      {page > 1 ? (
        <Button asChild variant="outline">
          <a href={href(page - 1)} rel="prev">
            <ChevronLeftIcon aria-hidden />
            {m.pagination_prev()}
          </a>
        </Button>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted-foreground">
        {m.pagination_status({ page: String(page), total: String(totalPages) })}
      </span>
      {page < totalPages ? (
        <Button asChild variant="outline">
          <a href={href(page + 1)} rel="next">
            {m.pagination_next()}
            <ChevronRightIcon aria-hidden />
          </a>
        </Button>
      ) : (
        <span />
      )}
    </nav>
  );
}
