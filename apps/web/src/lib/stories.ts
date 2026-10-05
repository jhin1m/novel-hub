import type { AuthorStoryView, TagView } from '@novel-hub/core';
import type { StoryCreateInput, StoryUpdateInput } from '@novel-hub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ClientResponse, type SuccessBody, createApiClient } from './api-client';
import { readApiError } from './api-errors';
import { meQueryKey } from './me';

const api = createApiClient();

export type { AuthorStoryView, TagView };

/** Under `['me']` so signing out or in refreshes them together with the account. */
export const myStoriesQueryKey = [...meQueryKey, 'stories'] as const;
export const myStoryQueryKey = (publicId: string) => [...myStoriesQueryKey, publicId] as const;
export const tagsQueryKey = ['tags'] as const;

/** Rejects with an `ApiError` unless the response is 2xx, so React Query sees failures. */
async function json<R extends ClientResponse<unknown, number>>(res: R): Promise<SuccessBody<R>> {
  if (!res.ok) throw await readApiError(res);
  return (await res.json()) as SuccessBody<R>;
}

export function useTags() {
  return useQuery({
    queryKey: tagsQueryKey,
    staleTime: 5 * 60_000,
    queryFn: async () => (await json(await api.api.v1.tags.$get())).tags,
  });
}

export function useMyStories() {
  return useQuery({
    queryKey: myStoriesQueryKey,
    queryFn: async () => (await json(await api.api.v1.me.stories.$get())).stories,
  });
}

export function useMyStory(publicId: string) {
  return useQuery({
    queryKey: myStoryQueryKey(publicId),
    queryFn: async () => {
      const res = await api.api.v1.me.stories[':publicId'].$get({ param: { publicId } });
      return (await json(res)).story;
    },
    // 403/404 will not change on retry.
    retry: false,
  });
}

/** Keeps the edit page and the story list in sync after any write. */
function useStoryWritten() {
  const queryClient = useQueryClient();
  return async (story: AuthorStoryView) => {
    queryClient.setQueryData(myStoryQueryKey(story.publicId), story);
    await queryClient.invalidateQueries({ queryKey: myStoriesQueryKey, exact: true });
  };
}

export function useCreateStory() {
  const queryClient = useQueryClient();
  const written = useStoryWritten();
  return useMutation({
    mutationFn: async (input: StoryCreateInput) =>
      (await json(await api.api.v1.stories.$post({ json: input }))).story,
    onSuccess: async (story) => {
      await written(story);
      // The first story makes the user an author.
      await queryClient.invalidateQueries({ queryKey: meQueryKey, exact: true });
    },
  });
}

export function useUpdateStory(publicId: string) {
  const written = useStoryWritten();
  return useMutation({
    mutationFn: async (input: StoryUpdateInput) => {
      const res = await api.api.v1.stories[':publicId'].$patch({
        param: { publicId },
        json: input,
      });
      return (await json(res)).story;
    },
    onSuccess: written,
  });
}

export function useUploadCover(publicId: string) {
  const written = useStoryWritten();
  return useMutation({
    // Plain `fetch`: `hc` cannot type a multipart `File` body.
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`/api/v1/stories/${encodeURIComponent(publicId)}/cover`, {
        method: 'PUT',
        body: form,
      });
      if (!res.ok) throw await readApiError(res);
      return ((await res.json()) as { story: AuthorStoryView }).story;
    },
    onSuccess: written,
  });
}

export function useRemoveCover(publicId: string) {
  const written = useStoryWritten();
  return useMutation({
    mutationFn: async () => {
      const res = await api.api.v1.stories[':publicId'].cover.$delete({ param: { publicId } });
      return (await json(res)).story;
    },
    onSuccess: written,
  });
}
