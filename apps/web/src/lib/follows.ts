import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

/** What a follow button follows: a story by public id, or an author by username. */
export type FollowTarget =
  { kind: 'story'; publicId: string } | { kind: 'author'; username: string };

/** Under `['me']` so signing out drops them together with the account. */
export const followQueryKey = (target: FollowTarget) =>
  [
    ...meQueryKey,
    'follows',
    target.kind,
    target.kind === 'story' ? target.publicId : target.username,
  ] as const;

/** Whether the signed-in reader follows `target`. Only for signed-in readers. */
export function useFollowing(target: FollowTarget, enabled: boolean) {
  return useQuery({
    queryKey: followQueryKey(target),
    enabled,
    queryFn: async () => {
      const res = await api.api.v1.follows.status.$get({
        query: target.kind === 'story' ? { story: target.publicId } : { author: target.username },
      });
      if (!res.ok) throw await readApiError(res);
      const status = await res.json();
      return (target.kind === 'story' ? status.story : status.author) ?? false;
    },
  });
}

/** Follows or unfollows; the button flips at once and rolls back if the request fails. */
export function useSetFollowing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ target, following }: { target: FollowTarget; following: boolean }) => {
      const res =
        target.kind === 'story'
          ? await api.api.v1.follows.stories[':publicId'][following ? '$put' : '$delete']({
              param: { publicId: target.publicId },
            })
          : await api.api.v1.follows.authors[':username'][following ? '$put' : '$delete']({
              param: { username: target.username },
            });
      if (!res.ok) throw await readApiError(res);
      await res.body?.cancel();
    },
    onMutate: async ({ target, following }) => {
      const key = followQueryKey(target);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<boolean>(key);
      queryClient.setQueryData(key, following);
      return { previous };
    },
    onError: (_error, { target }, context) => {
      queryClient.setQueryData(followQueryKey(target), context?.previous ?? false);
    },
    onSettled: (_data, _error, { target }) =>
      queryClient.invalidateQueries({ queryKey: followQueryKey(target) }),
  });
}
