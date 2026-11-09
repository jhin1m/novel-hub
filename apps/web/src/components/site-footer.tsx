import { canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';

const FOOTER_LINK = 'rounded-sm underline-offset-4 hover:text-foreground hover:underline';

export function SiteFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-6 gap-y-2 py-6 px-safe-4 text-[13px] text-muted-foreground md:px-safe-8">
        {/* CDN-cached HTML can hydrate after New Year, or in a different time zone than the server. */}
        <p suppressHydrationWarning>
          {m.layout_footer_copyright({
            year: String(new Date().getFullYear()),
            name: m.app_name(),
          })}
        </p>
        <nav aria-label={m.layout_footer_nav()} className="flex flex-wrap gap-x-4 gap-y-2">
          <a href={canonicalPath({ kind: 'ranking', period: 'week' })} className={FOOTER_LINK}>
            {m.ranking_nav()}
          </a>
          <a href={canonicalPath({ kind: 'contests' })} className={FOOTER_LINK}>
            {m.contest_nav()}
          </a>
          <a href={canonicalPath({ kind: 'static', path: '/terms' })} className={FOOTER_LINK}>
            {m.layout_terms()}
          </a>
          <a
            href={canonicalPath({ kind: 'static', path: '/content-policy' })}
            className={FOOTER_LINK}
          >
            {m.layout_content_policy()}
          </a>
          <a href={canonicalPath({ kind: 'static', path: '/privacy' })} className={FOOTER_LINK}>
            {m.layout_privacy()}
          </a>
        </nav>
      </div>
    </footer>
  );
}
