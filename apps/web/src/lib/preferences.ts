import type { PreferencesPatch } from '@novel-hub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { readApiError } from './api-errors';
import { syncMatureFlag } from './boot-script';
import { type MeUser, meQueryKey } from './me';

const api = createApiClient();

/**
 * Changes some of the signed-in account's preferences. Only the fields this request changed are
 * copied into the cached account (no refetch): two requests answering out of order must not
 * roll back each other's field.
 */
export function usePatchPreferences() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: PreferencesPatch) => {
      const res = await api.api.v1.me.preferences.$patch({ json: patch });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).preferences;
    },
    onSuccess: (preferences, patch) => {
      if (patch.showMature !== undefined) syncMatureFlag(preferences.showMature);
      queryClient.setQueryData<MeUser | null>(meQueryKey, (user) =>
        user
          ? {
              ...user,
              preferences: {
                ...user.preferences,
                ...(patch.showMature !== undefined && { showMature: preferences.showMature }),
                ...(patch.reader !== undefined && { reader: preferences.reader }),
              },
            }
          : user,
      );
    },
  });
}
