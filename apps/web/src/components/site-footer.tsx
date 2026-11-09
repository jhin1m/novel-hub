import { CONTESTS_ENABLED, SITE_THEME_CHOICES, canonicalPath } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { ChoiceGroup } from '@/components/reader/reader-settings-controls';
import { SITE_THEME_LABELS } from '@/components/settings/theme-setting';
import { useSiteTheme } from '@/lib/site-theme/use-site-theme';

const FOOTER_LINK = 'rounded-sm py-2 underline-offset-4 hover:text-foreground hover:underline';

/**
 * The same for every visitor, so the HTML stays publicly cacheable. The theme switch is here
 * because a guest has no account menu from `md` up; the boot script has already painted the stored
 * theme, so only the checked segment changes after hydration.
 */
export function SiteFooter() {
  const { choice, update } = useSiteTheme();
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-between gap-x-8 gap-y-3.5 py-7 px-safe-4 text-sm text-muted-foreground md:px-safe-8">
        <p>
          <span className="text-lg text-foreground">
            <span className="font-bold">{m.layout_logo_first()}</span>
            {m.layout_logo_second()}
          </span>
          {' · '}
          {m.layout_footer_tagline()}
        </p>
        <nav aria-label={m.layout_footer_nav()} className="flex flex-wrap gap-x-5 gap-y-1">
          <a href={canonicalPath({ kind: 'ranking', period: 'week' })} className={FOOTER_LINK}>
            {m.ranking_nav()}
          </a>
          {CONTESTS_ENABLED && (
            <a href={canonicalPath({ kind: 'contests' })} className={FOOTER_LINK}>
              {m.contest_nav()}
            </a>
          )}
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
        <ChoiceGroup
          legend={m.settings_theme_title()}
          legendClassName="sr-only"
          variant="segment"
          options={SITE_THEME_CHOICES}
          value={choice}
          labels={SITE_THEME_LABELS}
          onChange={update}
          // One weight for every segment, so the row does not change width with the choice.
          className="flex gap-0.5 p-[3px] [&_span]:h-11 [&_span]:px-3.5 [&_span]:text-[13px] [&_span]:font-semibold md:[&_span]:h-9"
        />
      </div>
    </footer>
  );
}
