import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { ApiError, readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

/**
 * Summary and reviews of a story. Public data, so not under `['me']`; the viewer's username is
 * part of the key because `isOwn` depends on the session.
 */
const storyRatingsKey = (publicId: string) => ['ratings', publicId] as const;
/** The reader's own rating: under `['me']`, so signing out drops it with the account. */
const myRatingKey = (publicId: string) => [...meQueryKey, 'rating', publicId] as const;

/**
 * The summary (first page) and the reviews of a story, newest first, a page at a time. Runs only
 * once `enabled` (the reader scrolled near the section).
 */
export function useStoryRatings(publicId: string, viewer: string | null, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: [...storyRatingsKey(publicId), viewer] as const,
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.api.v1.ratings.$get({
        query: { story: publicId, ...(pageParam === undefined ? {} : { cursor: pageParam }) },
      });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** The signed-in reader's rating of the story (`null` = not rated), hidden ones included. */
export function useMyRating(publicId: string, enabled: boolean) {
  return useQuery({
    queryKey: myRatingKey(publicId),
    enabled,
    queryFn: async () => {
      const res = await api.api.v1.ratings.mine.$get({ query: { story: publicId } });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).rating;
    },
  });
}

/** Reloads the story's ratings and the reader's own after a change, or after one was refused. */
function useInvalidateRatings(publicId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: storyRatingsKey(publicId) }),
      queryClient.invalidateQueries({ queryKey: myRatingKey(publicId) }),
    ]);
}

/** Rates the story or replaces the reader's earlier rating. */
export function useSaveRating(publicId: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateRatings(publicId);
  return useMutation({
    mutationFn: async (input: { score: number; review: string }) => {
      const res = await api.api.v1.ratings.$put({ json: { publicId, ...input } });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).rating;
    },
    onSettled: invalidate,
    // Muted since the account was loaded: reload it so the form turns into the notice.
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'USER_MUTED') {
        void queryClient.invalidateQueries({ queryKey: meQueryKey, exact: true });
      }
    },
  });
}

/** Deletes the reader's rating of the story. */
export function useDeleteRating(publicId: string) {
  const invalidate = useInvalidateRatings(publicId);
  return useMutation({
    mutationFn: async () => {
      const res = await api.api.v1.ratings.$delete({ query: { story: publicId } });
      if (!res.ok) throw await readApiError(res);
      await res.body?.cancel();
    },
    onSettled: invalidate,
  });
}
