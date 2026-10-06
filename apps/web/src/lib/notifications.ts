import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

/** Under `['me']` so signing out drops them together with the account. */
export const notificationsQueryKey = [...meQueryKey, 'notifications'] as const;
export const unreadCountQueryKey = [...notificationsQueryKey, 'unread'] as const;
const listQueryKey = [...notificationsQueryKey, 'list'] as const;

/** How often the bell asks for the unread count while the tab is visible (ms). */
const UNREAD_POLL_MS = 60_000;

/** Unread notifications of the signed-in reader; polls while the tab is visible and on focus. */
export function useUnreadCount(enabled: boolean) {
  return useQuery({
    queryKey: unreadCountQueryKey,
    enabled,
    refetchInterval: UNREAD_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const res = await api.api.v1.notifications['unread-count'].$get();
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).count;
    },
  });
}

/** The reader's notifications, newest first, a page at a time. */
export function useNotifications(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: listQueryKey,
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const res = await api.api.v1.notifications.$get({
        query: pageParam === undefined ? {} : { cursor: pageParam },
      });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Marks some (`ids`) or all notifications read, then reloads the list and the bell. */
export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { ids: string[] } | { all: true }) => {
      const res = await api.api.v1.notifications.read.$post({ json: input });
      if (!res.ok) throw await readApiError(res);
      await res.body?.cancel();
    },
    // Not awaited: a click on a notification navigates away once the request settles, without
    // waiting for the list and the bell to reload.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });
}
