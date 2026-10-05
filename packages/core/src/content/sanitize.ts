import sanitizeHtml from 'sanitize-html';

/**
 * Exactly the tags the chapter editor can produce. Even though the HTML is generated on the server
 * from a schema-checked document, it is sanitized again before storage as a second line of
 * defence: no URL schemes, no other attributes, anything unknown is dropped with its content.
 */
export const CHAPTER_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'h2', 'h3', 'strong', 'em', 's', 'blockquote', 'hr', 'br'],
  allowedAttributes: { p: ['data-pid'], h2: ['data-pid'], h3: ['data-pid'] },
  allowedSchemes: [],
  allowedSchemesAppliedToAttributes: [],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
};

export function sanitizeChapterHtml(html: string): string {
  return sanitizeHtml(html, CHAPTER_SANITIZE);
}
