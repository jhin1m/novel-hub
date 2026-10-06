import { comments } from '@novel-hub/db';
import { type SQL, sql } from 'drizzle-orm';

/** `created_at` in microseconds since the epoch, exact, as text (bigint does not fit a JS number). */
export const commentCreatedAtMicros = sql<string>`(extract(epoch from ${comments.createdAt}) * 1000000)::bigint::text`;

export interface CommentCursor {
  micros: string;
  id: string;
}

/** The cursor that continues a list after this comment. */
export function encodeCommentCursor(micros: string, id: string): string {
  return `${micros}_${id}`;
}

/** Reads a cursor already checked by `commentCursorSchema`; `null` for anything else. */
export function decodeCommentCursor(cursor: string): CommentCursor | null {
  const match = /^(\d{1,17})_([0-9a-f-]{36})$/.exec(cursor);
  return match?.[1] && match[2] ? { micros: match[1], id: match[2] } : null;
}

/** `(created_at, id)` compared with the cursor: `<` for newest-first lists, `>` for oldest-first. */
export function commentKeysetWhere(cursor: CommentCursor, direction: 'before' | 'after'): SQL {
  const at = sql`timestamptz 'epoch' + ${cursor.micros}::bigint * interval '1 microsecond'`;
  return direction === 'before'
    ? sql`(${comments.createdAt}, ${comments.id}) < (${at}, ${cursor.id}::uuid)`
    : sql`(${comments.createdAt}, ${comments.id}) > (${at}, ${cursor.id}::uuid)`;
}
