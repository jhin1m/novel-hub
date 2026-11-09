import type { AnnouncementDto } from '@novel-hub/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { ApiError, readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

export type { AnnouncementDto };

/** Under `['me']`: only the story's author sees this list, so signing out drops it. */
const storyAnnouncementsKey = (publicId: string) =>
  [...meQueryKey, 'announcements', publicId] as const;

/** The latest visible announcements of the author's story, newest first. */
export function useStoryAnnouncements(publicId: string) {
  return useQuery({
    queryKey: storyAnnouncementsKey(publicId),
    queryFn: async () => {
      const res = await api.api.v1.stories[':publicId'].announcements.$get({
        param: { publicId },
      });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).announcements;
    },
  });
}

/** Posts an announcement to the story's followers, then reloads the list. */
export function usePostAnnouncement(publicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const res = await api.api.v1.stories[':publicId'].announcements.$post({
        param: { publicId },
        json: { body },
      });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).announcement;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: storyAnnouncementsKey(publicId) }),
    // Muted since the account was loaded: reload it so the form turns into the notice.
    onError: (error) => {
      if (error instanceof ApiError && error.code === 'USER_MUTED') {
        void queryClient.invalidateQueries({ queryKey: meQueryKey, exact: true });
      }
    },
  });
}

/** Deletes one of the story's announcements, then reloads the list. */
export function useDeleteAnnouncement(publicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await api.api.v1.stories[':publicId'].announcements[':id'].$delete({
        param: { publicId, id },
      });
      if (!res.ok) throw await readApiError(res);
      await res.body?.cancel();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: storyAnnouncementsKey(publicId) }),
  });
}
