/**
 * Splits stories across the home page sections so a story shows in only one of them: each section
 * in priority order takes the stories no section before it claimed. A pure function of its input,
 * so it gives the same result in the HTML and after hydration when given the same lists.
 */

export interface HomeSection<T> {
  stories: readonly T[];
  /** Most stories the section shows. */
  limit: number;
  /**
   * `false`: shown as given (a ranking must stay true to its order) and only claims its stories
   * for the sections after it.
   */
  filtered: boolean;
  /**
   * More stories the section claims without showing them: the server-rendered list of a section
   * that swapped in a list loaded in the browser, so the sections below, rendered on the server
   * only, keep what they showed in the HTML. Only the part the section would show of it is
   * claimed (same filter and limit), never its spare stories.
   */
  alsoClaim?: readonly T[];
}

/** The stories each section shows, in the order given. A story twice in one section shows once. */
export function claimSections<T extends { publicId: string }>(
  sections: readonly HomeSection<T>[],
): T[][] {
  const claimed = new Set<string>();
  return sections.map((section) => {
    const pick = (stories: readonly T[]) =>
      section.filtered
        ? unique(stories.filter((story) => !claimed.has(story.publicId))).slice(0, section.limit)
        : stories.slice(0, section.limit);
    const shown = pick(section.stories);
    // Only what the section would have shown of that list, not the spare stories loaded with it.
    const alsoShown = section.alsoClaim ? pick(section.alsoClaim) : [];
    for (const story of [...shown, ...alsoShown]) claimed.add(story.publicId);
    return shown;
  });
}

function unique<T extends { publicId: string }>(stories: readonly T[]): T[] {
  const seen = new Set<string>();
  return stories.filter((story) => {
    if (seen.has(story.publicId)) return false;
    seen.add(story.publicId);
    return true;
  });
}
