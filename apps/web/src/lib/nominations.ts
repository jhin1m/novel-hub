import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { ApiError, readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

/** Every nomination status, under `['me']` so signing out drops them with the account. */
const nominationsKey = [...meQueryKey, 'nominations'] as const;
const nominationStatusKey = (publicId: string) => [...nominationsKey, publicId] as const;

/** What the signed-in reader can still do with their nominations for `publicId`. */
export function useNominationStatus(publicId: string, enabled: boolean) {
  return useQuery({
    queryKey: nominationStatusKey(publicId),
    enabled,
    queryFn: async () => {
      const res = await api.api.v1.nominations.status.$get({ query: { story: publicId } });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
  });
}

export type NominationStatus = NonNullable<ReturnType<typeof useNominationStatus>['data']>;

/**
 * Nominates the story. The reader's quota is shared by every story, so all their statuses reload
 * afterwards, and so does the account when the server says it was muted meanwhile.
 */
export function useNominate(publicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.api.v1.nominations.$post({ json: { publicId } });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    onSuccess: ({ remaining }) => {
      queryClient.setQueryData<NominationStatus>(nominationStatusKey(publicId), (previous) =>
        previous ? { ...previous, remaining, nominated: true } : previous,
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'USER_MUTED') {
        void queryClient.invalidateQueries({ queryKey: meQueryKey, exact: true });
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: nominationsKey }),
  });
}

/**
 * The top readers of a story. Public, but the 18+ answer follows the session, so the viewer's
 * username is part of the key. Runs only once `enabled`.
 */
export function useTopReaders(publicId: string, viewer: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['top-readers', publicId, viewer] as const,
    enabled,
    queryFn: async () => {
      const res = await api.api.v1.reading['top-readers'][':publicId'].$get({
        param: { publicId },
      });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).readers;
    },
  });
}
