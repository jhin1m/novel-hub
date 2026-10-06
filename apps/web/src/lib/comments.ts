import type { CommentCreateInput } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { ApiError, apiErrorMessage, readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

/**
 * Comments of a chapter, its paragraphs' included: one prefix, so posting or deleting anywhere
 * reloads the chapter's list, the paragraph threads and their counts. Public data, so not under
 * `['me']`; the viewer's username is part of the list keys because `isOwn` depends on the session,
 * and signing in or out must not show stale buttons.
 */
export const chapterCommentsKey = (publicId: string, number: number) =>
  ['comments', publicId, number] as const;
/** `paragraphId` `null`: the chapter's own threads. */
const threadListKey = (
  publicId: string,
  number: number,
  viewer: string | null,
  paragraphId: string | null,
) => [...chapterCommentsKey(publicId, number), viewer, 'threads', paragraphId] as const;
/** With the start cursor: when the preview changes (a reply deleted), the rest starts afresh. */
const repliesKey = (
  publicId: string,
  number: number,
  viewer: string | null,
  threadId: string,
  startCursor: string | null,
) => [...chapterCommentsKey(publicId, number), viewer, 'replies', threadId, startCursor] as const;

/**
 * Message for a failed comment call: a comment or chapter gone meanwhile (deleted, hidden) gets its
 * own wording instead of the generic "not found".
 */
export function commentErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.code === 'NOT_FOUND' || error.code === 'INVALID_STATE')) {
    return m.comment_gone();
  }
  return apiErrorMessage(error);
}

export interface CommentChapter {
  publicId: string;
  number: number;
}

/**
 * Threads under a chapter, newest first, a page at a time: those about `paragraphId`, or without
 * it the chapter's own (with those whose paragraph was edited out). Runs only once `enabled`.
 */
export function useChapterComments(
  chapter: CommentChapter,
  viewer: string | null,
  enabled: boolean,
  paragraphId: string | null = null,
) {
  const { publicId, number } = chapter;
  return useInfiniteQuery({
    queryKey: threadListKey(publicId, number, viewer, paragraphId),
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.api.v1.comments.$get({
        query: {
          story: publicId,
          chapter: String(number),
          ...(paragraphId === null ? {} : { paragraph: paragraphId }),
          ...(pageParam === undefined ? {} : { cursor: pageParam }),
        },
      });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/**
 * Comments shown about each paragraph, by `data-pid`. Loaded with the comments at the end of the
 * chapter (`enabled`), never with every read.
 */
export function useParagraphCommentCounts(chapter: CommentChapter, enabled: boolean) {
  const { publicId, number } = chapter;
  return useQuery({
    queryKey: [...chapterCommentsKey(publicId, number), 'paragraph-counts'] as const,
    enabled,
    queryFn: async () => {
      const res = await api.api.v1.comments['paragraph-counts'].$get({
        query: { story: publicId, chapter: String(number) },
      });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).counts;
    },
  });
}

/**
 * Replies of a thread past those that came with it, a page at a time from `startCursor`. Only
 * fetched once `enabled` (the reader asked for more).
 */
export function useMoreReplies(
  chapter: CommentChapter,
  viewer: string | null,
  threadId: string,
  startCursor: string | null,
  enabled: boolean,
) {
  return useInfiniteQuery({
    queryKey: repliesKey(chapter.publicId, chapter.number, viewer, threadId, startCursor),
    enabled: enabled && startCursor !== null,
    initialPageParam: startCursor ?? undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.api.v1.comments[':id'].replies.$get({
        param: { id: threadId },
        query: pageParam === undefined ? {} : { cursor: pageParam },
      });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Posts a comment (about a paragraph or not) or a reply, then reloads the chapter's comments. */
export function useCreateComment(chapter: CommentChapter) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: Omit<CommentCreateInput, 'publicId' | 'chapterNumber'>) => {
      const res = await api.api.v1.comments.$post({
        json: { ...input, publicId: chapter.publicId, chapterNumber: chapter.number },
      });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).comment;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: chapterCommentsKey(chapter.publicId, chapter.number),
      }),
    // Muted since the account was loaded: reload it so the form turns into the notice.
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'USER_MUTED') {
        void queryClient.invalidateQueries({ queryKey: meQueryKey, exact: true });
      }
    },
  });
}

/** Deletes the reader's own comment, then reloads the chapter's comments. */
export function useDeleteComment(chapter: CommentChapter) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.v1.comments[':id'].$delete({ param: { id } });
      if (!res.ok) throw await readApiError(res);
      await res.body?.cancel();
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: chapterCommentsKey(chapter.publicId, chapter.number),
      }),
  });
}
