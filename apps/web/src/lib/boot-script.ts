import {
  DEFAULT_READER_SETTINGS,
  LEGACY_READER_FONTS,
  READER_ALIGNS,
  READER_FONTS,
  READER_RANGES,
  READER_THEMES,
  READER_WIDTHS,
  SITE_THEME_CHOICES,
} from '@novel-hub/shared';
import { ACCOUNT_HINT_KEY, CONTINUE_ROWS_MAX } from './account-hint';
import { READER_CSS_VARS, READER_SETTINGS_KEY } from './reader/settings';
import { SITE_THEME_KEY } from './site-theme/site-theme';

/**
 * localStorage key of the "this browser may show 18+ content" hint. Set when the signed-in
 * account has `showMature` on, removed otherwise. Display hint only: never access control.
 */
export const MATURE_FLAG_KEY = 'nh:mature';

/** Choices that set `data-theme`; `system` leaves it off so the CSS follows the OS. */
const EXPLICIT_THEMES = SITE_THEME_CHOICES.filter((choice) => choice !== 'system');

const READER_ENUMS = {
  theme: READER_THEMES,
  font: READER_FONTS,
  width: READER_WIDTHS,
  align: READER_ALIGNS,
};

/** `[min, max, step, css variable, unit]` per numeric setting. */
const READER_NUMBERS = Object.fromEntries(
  (['fontSize', 'lineHeight', 'paragraphSpacing'] as const).map((key) => {
    const { min, max, step } = READER_RANGES[key];
    const { name, unit } = READER_CSS_VARS[key];
    return [key, [min, max, step, name, unit]];
  }),
);

/**
 * Inline script that runs first in `<head>`, before anything is painted:
 * - marks `<html>` with `data-mature-ok` so readers who allowed 18+ content never see the warning
 *   screen flash;
 * - applies the stored site theme (`data-theme`), the same way `applySiteTheme` does: only an
 *   allowlisted choice is written. Its own `try`, before the reader part (which returns early on
 *   broken data), so a broken value on either side never drops the other;
 * - applies the "last signed in" hint (`nh:account`, see `account-hint.ts`) the way
 *   `applyAccountHint` does, so the header placeholders show the right account state at once. The
 *   avatar letter is written as a hex escape only, so a tampered value can never inject CSS;
 * - applies the stored reader settings, the same way `applyReaderSettings` does: every field is
 *   checked against the allowlist and falls back to its default on its own, so a tampered value
 *   can never inject CSS. A font removed from the list is first mapped to its replacement
 *   (`LEGACY_READER_FONTS`), like the Zod schema does.
 * A static string (ES2017, no modules), so server and client render the same markup. Must never
 * throw (storage can be blocked).
 */
export const BOOT_SCRIPT = `(function(){try{var s=window.localStorage,d=document.documentElement;if(s.getItem('${MATURE_FLAG_KEY}')==='1'){d.setAttribute('data-mature-ok','')}try{var t=JSON.parse(s.getItem('${SITE_THEME_KEY}'));if(t&&${JSON.stringify(EXPLICIT_THEMES)}.indexOf(t.choice)>=0)d.setAttribute('data-theme',t.choice)}catch(e){}try{var a=JSON.parse(s.getItem('${ACCOUNT_HINT_KEY}')),c;if(a&&typeof a=='object'&&!Array.isArray(a)){d.setAttribute('data-signed-in','');c=a.initial;if(c===~~c&&c>32&&c<1114112)d.style.setProperty('--account-initial','"\\\\'+c.toString(16)+' "');c=a.continueRows;if(c===~~c&&c>0&&c<=${CONTINUE_ROWS_MAX})d.setAttribute('data-continue-rows',''+c)}}catch(e){}var r=JSON.parse(s.getItem('${READER_SETTINGS_KEY}'));if(!r||typeof r!=='object'||Array.isArray(r))return;var D=${JSON.stringify(DEFAULT_READER_SETTINGS)},E=${JSON.stringify(READER_ENUMS)},N=${JSON.stringify(READER_NUMBERS)},A=${JSON.stringify(LEGACY_READER_FONTS)},k,v,q,n;for(k in E){v=r[k];if(k==='font'&&typeof v==='string'&&A.hasOwnProperty(v))v=A[v];if(E[k].indexOf(v)<0)v=D[k];if(v===undefined)d.removeAttribute('data-reader-'+k);else d.setAttribute('data-reader-'+k,v)}for(k in N){q=N[k];v=r[k];n=(v-q[0])/q[2];if(typeof v!=='number'||!(v>=q[0]&&v<=q[1])||Math.abs(n-Math.round(n))>=1e-6)v=D[k];d.style.setProperty(q[3],v+q[4])}}catch(e){}})();`;

/**
 * Stores the 18+ hint for the next page load and applies it to the current page. Browser only.
 * Called whenever the signed-in account is known (or becomes a guest).
 */
export function syncMatureFlag(allowed: boolean): void {
  try {
    if (allowed) window.localStorage.setItem(MATURE_FLAG_KEY, '1');
    else window.localStorage.removeItem(MATURE_FLAG_KEY);
  } catch {
    // Blocked storage only costs the warning screen a flash on the next page.
  }
  document.documentElement.toggleAttribute('data-mature-ok', allowed);
}
