import type { ContinueDto } from '@novel-hub/core';
import type { Shelf } from '@novel-hub/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

/** Under `['me']` so signing out drops them together with the account. */
export const libraryQueryKey = [...meQueryKey, 'library'] as const;
export const shelfQueryKey = (publicId: string) => [...libraryQueryKey, 'shelf', publicId] as const;
const shelfListQueryKey = (shelf: Shelf, page: number) =>
  [...libraryQueryKey, 'list', shelf, page] as const;
export const historyQueryKey = [...meQueryKey, 'history'] as const;
const continueQueryKey = (publicId: string) => [...historyQueryKey, 'continue', publicId] as const;

/** Rejects with an `ApiError` unless the response is 2xx, releasing the body of empty answers. */
async function ensureOk(res: Response): Promise<void> {
  if (!res.ok) throw await readApiError(res);
  await res.body?.cancel();
}

/** The shelf a story is on (`null` = not in the library). Only for signed-in readers. */
export function useShelf(publicId: string, enabled: boolean) {
  return useQuery({
    queryKey: shelfQueryKey(publicId),
    enabled,
    queryFn: async () => {
      const res = await api.api.v1.library[':publicId'].$get({ param: { publicId } });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).shelf;
    },
  });
}

/**
 * Puts a story on a shelf, or takes it off (`shelf: null`). The story's shelf updates at once and
 * rolls back if the request fails; the shelf lists reload afterwards.
 */
export function useSetShelf() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ publicId, shelf }: { publicId: string; shelf: Shelf | null }) => {
      const param = { publicId };
      const route = api.api.v1.library[':publicId'];
      await ensureOk(
        shelf === null
          ? await route.$delete({ param })
          : await route.$put({ param, json: { shelf } }),
      );
    },
    onMutate: async ({ publicId, shelf }) => {
      const key = shelfQueryKey(publicId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<Shelf | null>(key);
      queryClient.setQueryData(key, shelf);
      return { previous };
    },
    onError: (_error, { publicId }, context) => {
      queryClient.setQueryData(shelfQueryKey(publicId), context?.previous ?? null);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: libraryQueryKey }),
  });
}

/** One page of a shelf. */
export function useLibraryShelf(shelf: Shelf, page: number, enabled: boolean) {
  return useQuery({
    queryKey: shelfListQueryKey(shelf, page),
    enabled,
    queryFn: async () => {
      const res = await api.api.v1.library.$get({ query: { shelf, page: String(page) } });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
  });
}

/** Where "continue reading" takes the reader in a story (`null` = never read). */
export function useContinueReading(publicId: string, enabled: boolean) {
  return useQuery({
    queryKey: continueQueryKey(publicId),
    enabled,
    queryFn: async (): Promise<ContinueDto | null> => {
      const res = await api.api.v1.reading.progress[':publicId'].$get({ param: { publicId } });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).progress;
    },
  });
}

/** The reading history, most recent first, a page at a time. */
export function useHistory(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: historyQueryKey,
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.api.v1.reading.history.$get({
        query: pageParam === undefined ? {} : { cursor: pageParam },
      });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Forgets a story from the reading history. */
export function useRemoveFromHistory() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (publicId: string) => {
      const res = await api.api.v1.reading.history[':publicId'].$delete({ param: { publicId } });
      await ensureOk(res);
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: historyQueryKey }),
        // Shelves show the progress too.
        queryClient.invalidateQueries({ queryKey: libraryQueryKey }),
      ]),
  });
}
