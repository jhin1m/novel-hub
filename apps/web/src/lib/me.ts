import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { authClient } from './auth-client';
import { throwIfAuthError } from './auth-errors';

const api = createApiClient();

export const meQueryKey = ['me'] as const;

/**
 * The signed-in account (`null` = guest). Only runs in the browser, so server-rendered HTML never
 * depends on cookies and can be cached publicly.
 */
export function useMe() {
  return useQuery({
    queryKey: meQueryKey,
    // The site header mounts this on every page; sign-in and sign-out update the cache directly.
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.api.v1.me.$get();
      if (res.status === 200) return (await res.json()).user;
      // Release unread bodies: an unconsumed chunked response stays open in the browser and
      // keeps the connection busy (the site header runs this on every page).
      await res.body?.cancel();
      if (res.status === 401) return null;
      throw new Error('GET /api/v1/me failed');
    },
  });
}

/** Signs out, then flips `useMe()` to guest immediately instead of waiting for a refetch. */
export function useSignOut() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await authClient.signOut();
      throwIfAuthError(error);
    },
    onSuccess: () => {
      // Drop every per-account cache (my stories...) so the next account never sees them.
      queryClient.removeQueries({ queryKey: meQueryKey });
      queryClient.setQueryData(meQueryKey, null);
    },
  });
}
