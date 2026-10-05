import { isValidPublicId } from './public-id';

/**
 * Splits the `{slug}-{publicId}` URL segment. The story is looked up by `publicId` (after the last
 * `-`); the slug is only for readability and may be stale, so callers redirect when it differs.
 * Returns `null` when the public id part is malformed.
 */
export function parseStoryKey(key: string): { slug: string; publicId: string } | null {
  const dash = key.lastIndexOf('-');
  const slug = dash === -1 ? '' : key.slice(0, dash);
  const publicId = key.slice(dash + 1);
  return isValidPublicId(publicId) ? { slug, publicId } : null;
}

export function storyKey(story: { slug: string; publicId: string }): string {
  return `${story.slug}-${story.publicId}`;
}
