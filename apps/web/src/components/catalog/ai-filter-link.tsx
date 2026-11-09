import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Turns the tag page's "hide stories written with AI" filter on or off. A plain link to the other
 * canonical URL (back to the first page), so it works without JavaScript and each variant is its
 * own publicly cached page.
 */
export function AiFilterLink({ slug, noAi }: { slug: string; noAi: boolean }) {
  return (
    <Button asChild variant="outline" size="sm">
      <a href={canonicalPath({ kind: 'tag', slug, noAi: !noAi })} title={m.filter_hide_ai_hint()}>
        {noAi ? <EyeIcon aria-hidden /> : <EyeOffIcon aria-hidden />}
        {noAi ? m.filter_show_ai() : m.filter_hide_ai()}
      </a>
    </Button>
  );
}
