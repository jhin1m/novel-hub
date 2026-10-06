import { useQuery } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

/** Under `['me']`: the author's own numbers go away with the account on sign-out. */
const storyStatsKey = (publicId: string) => [...meQueryKey, 'story-stats', publicId] as const;

/** The dashboard of one of the author's stories (last 30 days). 404 = not theirs, or no story. */
export function useStoryStats(publicId: string) {
  return useQuery({
    queryKey: storyStatsKey(publicId),
    queryFn: async () => {
      const res = await api.api.v1['author-stats'][':publicId'].$get({ param: { publicId } });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    // 404 will not change on retry.
    retry: false,
  });
}
