import { createHash } from 'node:crypto';
import { countWords, docToText } from '@novel-hub/shared';
import { type EditorDocJson, parseEditorDoc } from '@novel-hub/shared/editor';
import { type Result, err, ok } from '../lib/result';
import { normalizePids } from './normalize-pids';
import { sanitizeChapterHtml } from './sanitize';
import { walkDocToHtml } from './walker';

export interface PublishedContent {
  /** The document with normalized pids; this is what gets stored next to the HTML. */
  doc: EditorDocJson;
  html: string;
  paragraphIds: string[];
  /** sha256 of `html`: equal hashes mean nothing a reader sees has changed. */
  contentHash: string;
  wordCount: number;
  pidsChanged: boolean;
}

/** Walker then sanitizer, without touching pids (used to preview a revision as it was). */
export function renderChapterHtml(doc: EditorDocJson): string {
  return sanitizeChapterHtml(walkDocToHtml(doc));
}

export function hashContent(html: string): string {
  return createHash('sha256').update(html).digest('hex');
}

/**
 * The one pipeline that turns an untrusted draft into stored chapter content: schema check →
 * pid normalization → HTML → sanitize → word count → hash. HTML is never accepted from a client.
 */
export function renderPublishedContent(
  input: unknown,
  gen?: () => string,
): Result<PublishedContent, 'INVALID_DOCUMENT'> {
  const parsed = parseEditorDoc(input);
  if (!parsed.ok) return err('INVALID_DOCUMENT');
  const { doc, paragraphIds, pidsChanged } = normalizePids(parsed.doc, gen);
  const html = renderChapterHtml(doc);
  return ok({
    doc,
    html,
    paragraphIds,
    contentHash: hashContent(html),
    wordCount: countWords(docToText(doc)),
    pidsChanged,
  });
}
