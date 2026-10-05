import type { ModerationActionInput, ReportCreateInput, ReportListQuery } from '@novel-hub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

/** Under `['me']` so signing out drops the queue together with the account. */
export const reportsQueryKey = [...meQueryKey, 'moderation', 'reports'] as const;

/** Files a report; resolves to whether a new one was created (`false`: already reported). */
export function useCreateReport() {
  return useMutation({
    mutationFn: async (input: ReportCreateInput) => {
      const res = await api.api.v1.reports.$post({ json: input });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).created;
    },
  });
}

/** One page of the moderation queue. A non-moderator gets an `ApiError` with status 403. */
export function useReports(query: ReportListQuery, enabled: boolean) {
  return useQuery({
    queryKey: [...reportsQueryKey, query],
    enabled,
    retry: false,
    queryFn: async () => {
      const res = await api.api.v1.moderation.reports.$get({
        query: {
          status: query.status,
          page: String(query.page),
          ...(query.reason ? { reason: query.reason } : {}),
        },
      });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
  });
}

/** Applies a moderator action, then reloads the queue (states and open counts changed). */
export function useModerationAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ModerationActionInput) => {
      const res = await api.api.v1.moderation.actions.$post({ json: input });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: reportsQueryKey }),
  });
}
