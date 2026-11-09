/**
 * Whether a viewer may see 18+ content (comments under an 18+ story, today): a signed-in account
 * that turned `preferences.showMature` on. Guests (`null`) never may.
 */
export function canViewMatureContent(viewer: { showMature: boolean } | null): boolean {
  return viewer?.showMature === true;
}
