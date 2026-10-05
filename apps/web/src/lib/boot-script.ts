/**
 * localStorage key of the "this browser may show 18+ content" hint. Set when the signed-in
 * account has `showMature` on, removed otherwise. Display hint only: never access control.
 */
export const MATURE_FLAG_KEY = 'nh:mature';

/**
 * Inline script that runs first in `<head>`, before anything is painted: marks `<html>` with
 * `data-mature-ok` so readers who allowed 18+ content never see the warning screen flash.
 * A static string, so server and client render the same markup. Must never throw (storage can be
 * blocked).
 */
export const BOOT_SCRIPT = `(function(){try{if(window.localStorage.getItem('${MATURE_FLAG_KEY}')==='1'){document.documentElement.setAttribute('data-mature-ok','')}}catch(e){}})();`;

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
