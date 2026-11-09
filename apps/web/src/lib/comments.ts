import { m } from '@novel-hub/shared/messages';
import {
  type QueryClient,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { ApiError, apiErrorMessage, readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

export interface CommentChapter {
  publicId: string;
  number: number;
}

/** Where comments are: under a chapter, or in the story's discussion (`number: null`). */
export interface CommentScope {
  publicId: string;
  number: number | null;
}

/**
 * Comments of a chapter, its paragraphs' included: one prefix, so posting or deleting anywhere
 * reloads the chapter's list, the paragraph threads and their counts. Public data, so not under
 * `['me']`; the viewer's username is part of the list keys because `isOwn` and `viewerCanPin`
 * depend on the session, and signing in or out must not show stale buttons.
 */
export const chapterCommentsKey = (publicId: string, number: number) =>
  ['comments', publicId, number] as const;
/** The prefix of everything about the scope's comments: the chapter's, or the discussion's. */
const commentScopeKey = (scope: CommentScope) =>
  scope.number === null
    ? (['comments', 'discussion', scope.publicId] as const)
    : chapterCommentsKey(scope.publicId, scope.number);
/** `paragraphId` `null`: the chapter's own threads. */
const threadListKey = (
  publicId: string,
  number: number,
  viewer: string | null,
  paragraphId: string | null,
) => [...chapterCommentsKey(publicId, number), viewer, 'threads', paragraphId] as const;
/** With the start cursor: when the preview changes (a reply deleted), the rest starts afresh. */
const repliesKey = (
  scope: CommentScope,
  viewer: string | null,
  threadId: string,
  startCursor: string | null,
) => [...commentScopeKey(scope), viewer, 'replies', threadId, startCursor] as const;

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

/**
 * Reacts to a failed comment call. Muted, or 18+ turned off, since the account was loaded (another
 * tab): reload the account so the form turns into the muted notice, or the reading page shows its
 * 18+ warning again instead of the comments.
 */
function onCommentApiError(queryClient: QueryClient, error: unknown): void {
  if (
    error instanceof ApiError &&
    (error.code === 'USER_MUTED' || error.code === 'MATURE_CONTENT_DISABLED')
  ) {
    void queryClient.invalidateQueries({ queryKey: meQueryKey, exact: true });
  }
}

/** The error of a failed comment list call, reported through `onCommentApiError`, to throw. */
async function commentListError(queryClient: QueryClient, res: Response): Promise<ApiError> {
  const error = await readApiError(res);
  onCommentApiError(queryClient, error);
  return error;
}

/** A refusal (4xx) will not change on retry; network and server errors are retried. */
const retryUnlessRefused = (failureCount: number, error: unknown) =>
  !(error instanceof ApiError && error.status < 500) && failureCount < 3;

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
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: threadListKey(publicId, number, viewer, paragraphId),
    enabled,
    retry: retryUnlessRefused,
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
      if (!res.ok) throw await commentListError(queryClient, res);
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
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: [...chapterCommentsKey(publicId, number), 'paragraph-counts'] as const,
    enabled,
    retry: retryUnlessRefused,
    queryFn: async () => {
      const res = await api.api.v1.comments['paragraph-counts'].$get({
        query: { story: publicId, chapter: String(number) },
      });
      if (!res.ok) throw await commentListError(queryClient, res);
      return (await res.json()).counts;
    },
  });
}

/**
 * Threads of the story's discussion (tied to no chapter), newest first after the pinned ones, a
 * page at a time. Runs only once `enabled`.
 */
export function useStoryDiscussion(publicId: string, viewer: string | null, enabled: boolean) {
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: [...commentScopeKey({ publicId, number: null }), viewer, 'threads'] as const,
    enabled,
    retry: retryUnlessRefused,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.api.v1.comments.discussion.$get({
        query: { story: publicId, ...(pageParam === undefined ? {} : { cursor: pageParam }) },
      });
      if (!res.ok) throw await commentListError(queryClient, res);
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** A list of threads in any scope, as `CommentFeed` shows it (the discussion's has the same shape). */
export type CommentThreadsQuery = ReturnType<typeof useChapterComments>;

/**
 * Replies of a thread past those that came with it, a page at a time from `startCursor`. Only
 * fetched once `enabled` (the reader asked for more).
 */
export function useMoreReplies(
  scope: CommentScope,
  viewer: string | null,
  threadId: string,
  startCursor: string | null,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: repliesKey(scope, viewer, threadId, startCursor),
    enabled: enabled && startCursor !== null,
    retry: retryUnlessRefused,
    initialPageParam: startCursor ?? undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.api.v1.comments[':id'].replies.$get({
        param: { id: threadId },
        query: pageParam === undefined ? {} : { cursor: pageParam },
      });
      if (!res.ok) throw await commentListError(queryClient, res);
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** After a change to a comment: reloads everything listed in its scope. */
function invalidateScope(queryClient: QueryClient, scope: CommentScope) {
  return queryClient.invalidateQueries({ queryKey: commentScopeKey(scope) });
}

/**
 * Posts a comment or a reply, then reloads the scope's comments. Under a chapter a new thread may be
 * about a paragraph; the discussion has none.
 */
export function useCreateComment(scope: CommentScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { body: string; parentId?: string; paragraphId?: string }) => {
      const res =
        scope.number === null
          ? await api.api.v1.comments.discussion.$post({
              json: {
                publicId: scope.publicId,
                body: input.body,
                ...(input.parentId ? { parentId: input.parentId } : {}),
              },
            })
          : await api.api.v1.comments.$post({
              json: { ...input, publicId: scope.publicId, chapterNumber: scope.number },
            });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).comment;
    },
    onSuccess: () => invalidateScope(queryClient, scope),
    onError: (error) => onCommentApiError(queryClient, error),
  });
}

/** Replaces the text of the reader's own comment, then reloads the scope's comments. */
export function useEditComment(scope: CommentScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      const res = await api.api.v1.comments[':id'].$patch({ param: { id }, json: { body } });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).comment;
    },
    onSuccess: () => invalidateScope(queryClient, scope),
    onError: (error) => onCommentApiError(queryClient, error),
  });
}

/** The story's author pins or unpins a top-level comment, then reloads the scope's comments. */
export function usePinComment(scope: CommentScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, pinned }: { id: string; pinned: boolean }) => {
      const res = await api.api.v1.comments[':id'].pin.$put({ param: { id }, json: { pinned } });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    onSettled: () => invalidateScope(queryClient, scope),
  });
}

/** Deletes the reader's own comment, then reloads the scope's comments. */
export function useDeleteComment(scope: CommentScope) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.v1.comments[':id'].$delete({ param: { id } });
      if (!res.ok) throw await readApiError(res);
      await res.body?.cancel();
    },
    onSettled: () => invalidateScope(queryClient, scope),
  });
}
