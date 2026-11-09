import type { ImportChaptersResult } from '@novel-hub/core';
import type { ChapterImportInput } from '@novel-hub/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from '../api-client';
import { readApiError } from '../api-errors';
import { myStoriesQueryKey } from '../stories';

const api = createApiClient();

export type { ImportChaptersResult };

/** Sends a bulk chapter import, then refreshes the author's story and chapter data. */
export function useImportChapters(publicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChapterImportInput): Promise<ImportChaptersResult> => {
      const res = await api.api.v1.stories[':publicId'].chapters.import.$post({
        param: { publicId },
        json: input,
      });
      if (!res.ok) throw await readApiError(res);
      return res.json();
    },
    // Chapters, counters and the story's visibility (first publish) may all have changed; on an
    // error too, since a failure after the drafts were written still leaves them in place.
    onSettled: () => queryClient.invalidateQueries({ queryKey: myStoriesQueryKey }),
  });
}
