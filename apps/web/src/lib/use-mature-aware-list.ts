import type { StoryList } from '@novel-hub/core';
import type { StoryListQuery } from '@novel-hub/shared';
import { useQuery } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { readApiError } from './api-errors';
import { useMe } from './me';

const api = createApiClient();

/**
 * A public list as this reader may see it. The server-rendered list never holds 18+ stories (the
 * HTML is cached for everyone); once the account turns out to allow them, the same list is fetched
 * from the uncached API and replaces it. Until then, or if that request fails, the SSR list stays.
 */
export function useMatureAwareList(ssr: StoryList, query: StoryListQuery): StoryList {
  const me = useMe();
  const allowed = me.data?.preferences.showMature === true;
  const list = useQuery({
    queryKey: ['stories', query],
    enabled: allowed,
    queryFn: async () => {
      const res = await api.api.v1.stories.$get({ query });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
  });
  return allowed && list.data ? list.data : ssr;
}
