import { canonicalPath } from '@novel-hub/shared';
import { coverColorVar } from '../lib/cover-palette';

/**
 * Pill link to a tag page with a dot in the tag's cover colour. A plain document link, so the tag
 * page comes from the CDN-cached HTML; its accessible name is the tag name only.
 */
export function TagChip({ slug, name }: { slug: string; name: string }) {
  return (
    <a
      href={canonicalPath({ kind: 'tag', slug })}
      className="inline-flex h-9 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[13px] font-semibold whitespace-nowrap outline-none hover:bg-secondary focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      {/* Only a numeric palette slot reaches `style`, never user text. */}
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: coverColorVar(slug) }}
      />
      {name}
    </a>
  );
}
