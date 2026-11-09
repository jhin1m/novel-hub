import { SITE_THEME_CHOICES, type SiteThemeChoice } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useSiteTheme } from '@/lib/site-theme/use-site-theme';
import { cn } from '@/lib/utils';
import { pageCardClass } from '../page-shell';
import { ChoiceGroup } from '../reader/reader-settings-controls';
import { SETTINGS_HEADING_CLASS } from './mature-setting';

/** Labels of the site theme choices, shared by this section and the account menu. */
export const SITE_THEME_LABELS: Record<SiteThemeChoice, () => string> = {
  system: m.settings_theme_system,
  ivory: m.settings_theme_ivory,
  dark: m.settings_theme_dark,
};

/**
 * "Appearance": follow the system, Ivory or Dark. Shown to guests too and while the account is
 * still loading, since the choice lives in this browser first and only syncs when signed in.
 */
export function ThemeSetting() {
  const { choice, update } = useSiteTheme();
  return (
    <section aria-labelledby="theme-title" className={cn(pageCardClass, 'flex flex-col gap-3')}>
      <h2 id="theme-title" className={SETTINGS_HEADING_CLASS}>
        {m.settings_theme_title()}
      </h2>
      <p className="text-sm text-muted-foreground">{m.settings_theme_hint()}</p>
      {/* The h2 already names the group on screen; the legend stays for screen readers. */}
      <ChoiceGroup
        legend={m.settings_theme_title()}
        legendClassName="sr-only"
        variant="segment"
        options={SITE_THEME_CHOICES}
        value={choice}
        labels={SITE_THEME_LABELS}
        onChange={update}
        className="grid grid-cols-3"
      />
    </section>
  );
}
