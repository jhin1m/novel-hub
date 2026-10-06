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

/** Under `['me']` like the queue: moderator-only data leaves with the account. */
export const featuredSlotsQueryKey = [...meQueryKey, 'moderation', 'featured'] as const;

/** Featured slots for moderators: running, upcoming, recently ended. */
export function useFeaturedSlots() {
  return useQuery({
    queryKey: featuredSlotsQueryKey,
    retry: false,
    queryFn: async () => {
      const res = await api.api.v1.moderation.featured.$get();
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
  });
}

/** Features a story (a link or public id; times as ISO with offset), then reloads the list. */
export function useCreateFeaturedSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { story: string; startsAt: string; endsAt: string }) => {
      const res = await api.api.v1.moderation.featured.$post({ json: input });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: featuredSlotsQueryKey }),
  });
}

/** Ends a running slot now (`end`) or deletes one not started yet (`delete`), then reloads. */
export function useChangeFeaturedSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, change }: { id: string; change: 'end' | 'delete' }) => {
      const slot = api.api.v1.moderation.featured[':id'];
      const res =
        change === 'end'
          ? await slot.end.$post({ param: { id } })
          : await slot.$delete({ param: { id } });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: featuredSlotsQueryKey }),
  });
}

/** Under `['me']` like the queue: moderator-only data leaves with the account. */
export const contestsAdminQueryKey = [...meQueryKey, 'moderation', 'contests'] as const;

/** Contests for moderators, newest start first. */
export function useAdminContests() {
  return useQuery({
    queryKey: contestsAdminQueryKey,
    retry: false,
    queryFn: async () => {
      const res = await api.api.v1.moderation.contests.$get();
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
  });
}

/** Creates a contest (no `id`) or replaces one's fields, then reloads the list. */
export function useSaveContest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...json }: ContestFields & { id?: string }) => {
      const res = id
        ? await api.api.v1.moderation.contests[':id'].$patch({ param: { id }, json })
        : await api.api.v1.moderation.contests.$post({ json });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: contestsAdminQueryKey }),
  });
}

/** What the contest form sends: times as ISO with offset. */
export interface ContestFields {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
}

/** Entries of a contest for ranking. */
export function useContestEntries(id: string) {
  return useQuery({
    queryKey: [...contestsAdminQueryKey, id, 'entries'],
    retry: false,
    queryFn: async () => {
      const res = await api.api.v1.moderation.contests[':id'].entries.$get({ param: { id } });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
  });
}

/** Places an entry (1–3) or clears its place (`null`), then reloads the entries and the list. */
export function useSetContestPlacement(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (json: { story: string; placement: 1 | 2 | 3 | null }) => {
      const res = await api.api.v1.moderation.contests[':id'].placements.$put({
        param: { id },
        json,
      });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: contestsAdminQueryKey }),
  });
}
