import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

/** Under `['me']` so signing out drops it together with the account. */
const openContestsKey = (publicId: string) =>
  [...meQueryKey, 'contests', 'open', publicId] as const;

/** The open contests as one of the author's stories sees them (entered, eligible, reason). */
export function useOpenContests(publicId: string) {
  return useQuery({
    queryKey: openContestsKey(publicId),
    retry: false,
    queryFn: async () => {
      const res = await api.api.v1.contests.open.$get({ query: { story: publicId } });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
  });
}

/** Enters the story in a contest (`enter: true`) or withdraws it, then reloads the panel. */
export function useContestEntry(publicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ slug, enter }: { slug: string; enter: boolean }) => {
      const entry = api.api.v1.contests[':slug'].entries[':publicId'];
      const param = { slug, publicId };
      const res = enter ? await entry.$put({ param }) : await entry.$delete({ param });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: openContestsKey(publicId) }),
  });
}
