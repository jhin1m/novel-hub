import { comments, type users } from '@novel-hub/db';
import { type AnyColumn, type SQL, and, eq, ne } from 'drizzle-orm';
import type { UserStatus } from '../policies/user';
import { commentCreatedAtMicros } from './comment-cursor';

/** A comment as readers get it: no user id, no email; `isOwn` is decided on the server. */
export interface CommentDto {
  /** Internal id, used by the delete, replies and report calls; the UI never shows it. */
  id: string;
  body: string;
  createdAt: string;
  author: { username: string; displayName: string };
  isOwn: boolean;
  /** When the story's author pinned it on top; `null` when not pinned. */
  pinnedAt: string | null;
  /** When its writer last edited the text; `null` when never edited. */
  editedAt: string | null;
}

/** A top-level comment with the size of its thread and its oldest replies. */
export interface CommentThreadDto extends CommentDto {
  /** About a paragraph no longer in the chapter's text, so listed with the chapter's own. */
  orphanedParagraph: boolean;
  replyCount: number;
  replies: CommentDto[];
  /** Continues the replies after the ones sent here; `null` when they are all here. */
  moreRepliesCursor: string | null;
}

/**
 * Who is reading: the session's user (id and account status, enough to tell whether they may pin),
 * or `null` for a guest.
 */
export type CommentViewer = { id: string; status: UserStatus } | null;

/** Columns every comment list selects, with the writer joined as `author`. */
export function commentColumns(author: typeof users) {
  return {
    id: comments.id,
    body: comments.body,
    createdAt: comments.createdAt,
    micros: commentCreatedAtMicros,
    userId: comments.userId,
    username: author.username,
    displayName: author.displayName,
    pinnedAt: comments.pinnedAt,
    editedAt: comments.editedAt,
  };
}

export interface CommentRow {
  id: string;
  body: string;
  createdAt: Date;
  micros: string;
  userId: string;
  username: string;
  displayName: string;
  pinnedAt: Date | null;
  editedAt: Date | null;
}

/**
 * A comment anyone may see: shown by its writer and moderators alike, and its writer not banned
 * (banning hides everything an account wrote without deleting it). `author` is the writer's row.
 */
export function visibleCommentWhere(
  author: { status: AnyColumn },
  comment: { status: AnyColumn } = comments,
): SQL {
  return and(eq(comment.status, 'visible'), ne(author.status, 'banned')) as SQL;
}

export function toCommentDto(row: CommentRow, viewer: CommentViewer): CommentDto {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: { username: row.username, displayName: row.displayName },
    isOwn: viewer?.id === row.userId,
    pinnedAt: row.pinnedAt?.toISOString() ?? null,
    editedAt: row.editedAt?.toISOString() ?? null,
  };
}
