import type {
  AuthorChapterView,
  DraftView,
  RestoredDraft,
  RevisionPreview,
  RevisionSummary,
} from '@novel-hub/core';
import type { ChapterMetaInput, EditorDocJson } from '@novel-hub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createApiClient } from './api-client';
import { readApiError } from './api-errors';
import type { SaveOutcome } from './autosave';
import { sameDoc } from './draft-mirror';
import { meQueryKey } from './me';
import { myStoryQueryKey } from './stories';

const api = createApiClient();
const chapters = api.api.v1.stories[':publicId'].chapters;

export type { AuthorChapterView, DraftView, RestoredDraft, RevisionPreview, RevisionSummary };

/** `keepalive` requests are capped around 64 KB by browsers; larger bodies go as normal requests. */
const KEEPALIVE_MAX_BYTES = 60_000;

export const myChaptersQueryKey = (publicId: string) =>
  [...myStoryQueryKey(publicId), 'chapters'] as const;

/**
 * Not under the chapter list key: invalidating the list (after a title change) must never refetch
 * the draft, which would hand the editor a new version while autosave holds the old one.
 */
const chapterDraftQueryKey = (publicId: string, number: number) =>
  [...meQueryKey, 'chapter-draft', publicId, number] as const;

export function useMyChapters(publicId: string) {
  return useQuery({
    queryKey: myChaptersQueryKey(publicId),
    queryFn: async () => {
      const res = await api.api.v1.me.stories[':publicId'].chapters.$get({ param: { publicId } });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).chapters;
    },
    retry: false,
  });
}

export function useCreateChapter(publicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await chapters.$post({ param: { publicId } });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).chapter;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: myChaptersQueryKey(publicId), exact: true }),
  });
}

export async function fetchDraft(publicId: string, number: number): Promise<DraftView> {
  const res = await chapters[':number'].draft.$get({
    param: { publicId, number: String(number) },
  });
  if (!res.ok) throw await readApiError(res);
  return res.json();
}

/**
 * The draft is loaded once per editor visit: a background refetch would replace the document
 * under the author's cursor.
 */
export function useChapterDraft(publicId: string, number: number) {
  return useQuery({
    queryKey: chapterDraftQueryKey(publicId, number),
    queryFn: () => fetchDraft(publicId, number),
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

/**
 * A save whose response was lost (gateway timeout, dropped connection) is retried with the old
 * version and gets 409 even though the server holds exactly this document. Only a draft with
 * different content is a real conflict.
 */
async function conflictOrOwnWrite(
  publicId: string,
  number: number,
  doc: EditorDocJson,
): Promise<SaveOutcome> {
  try {
    const latest = await fetchDraft(publicId, number);
    if (sameDoc(latest.doc, doc)) return { ok: true, updatedAt: latest.updatedAt };
  } catch {
    // Could not check: let the author choose.
  }
  return { ok: false, kind: 'conflict' };
}

/** Maps the save response onto what autosave needs: retry only what a retry can fix. */
export async function saveDraftRequest(
  publicId: string,
  number: number,
  doc: EditorDocJson,
  baseUpdatedAt: string,
  opts: { keepalive: boolean },
): Promise<SaveOutcome> {
  const json = { doc, baseUpdatedAt };
  const keepalive =
    opts.keepalive && new TextEncoder().encode(JSON.stringify(json)).length < KEEPALIVE_MAX_BYTES;
  const res = await chapters[':number'].draft.$put(
    { param: { publicId, number: String(number) }, json },
    { init: { keepalive } },
  );
  if (res.ok) return { ok: true, updatedAt: (await res.json()).updatedAt };
  // Widened: proxies and the body limit answer with statuses the route types do not list.
  const status: number = res.status;
  if (status === 409) return conflictOrOwnWrite(publicId, number, doc);
  if (status >= 500 || status === 408 || status === 429) {
    return { ok: false, kind: 'retryable' };
  }
  return { ok: false, kind: 'fatal' };
}

/** Answer of publish and schedule; `draft.doc` is set when the server rewrote paragraph ids. */
export interface PublishResponse {
  chapter: AuthorChapterView;
  draft: { updatedAt: string; doc: EditorDocJson | null };
  unchanged: boolean;
}

export async function publishRequest(
  publicId: string,
  number: number,
  baseUpdatedAt: string,
): Promise<PublishResponse> {
  const res = await chapters[':number'].publish.$post({
    param: { publicId, number: String(number) },
    json: { baseUpdatedAt },
  });
  if (!res.ok) throw await readApiError(res);
  return res.json();
}

export async function scheduleRequest(
  publicId: string,
  number: number,
  baseUpdatedAt: string,
  scheduledAt: Date,
): Promise<PublishResponse> {
  const res = await chapters[':number'].schedule.$put({
    param: { publicId, number: String(number) },
    json: { baseUpdatedAt, scheduledAt: scheduledAt.toISOString() },
  });
  if (!res.ok) throw await readApiError(res);
  return res.json();
}

export async function unscheduleRequest(
  publicId: string,
  number: number,
): Promise<AuthorChapterView> {
  const res = await chapters[':number'].schedule.$delete({
    param: { publicId, number: String(number) },
  });
  if (!res.ok) throw await readApiError(res);
  return (await res.json()).chapter;
}

export function useDeleteChapter(publicId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (number: number) => {
      const res = await chapters[':number'].$delete({
        param: { publicId, number: String(number) },
      });
      if (!res.ok) throw await readApiError(res);
    },
    // The story (counters, last update) changes with the chapter list.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: myStoryQueryKey(publicId) }),
  });
}

export function useUpdateChapterMeta(publicId: string, number: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: ChapterMetaInput) => {
      const res = await chapters[':number'].$patch({
        param: { publicId, number: String(number) },
        json: input,
      });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).chapter;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: myChaptersQueryKey(publicId), exact: true }),
  });
}

export const revisionsQueryKey = (publicId: string, number: number) =>
  [...meQueryKey, 'chapter-revisions', publicId, number] as const;

/** Fetched each time the history opens: a publish or a restore adds a revision. */
export function useRevisions(publicId: string, number: number, enabled: boolean) {
  return useQuery({
    queryKey: revisionsQueryKey(publicId, number),
    queryFn: async (): Promise<RevisionSummary[]> => {
      const res = await chapters[':number'].revisions.$get({
        param: { publicId, number: String(number) },
      });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).revisions;
    },
    enabled,
    staleTime: 0,
    retry: false,
  });
}

/** A revision never changes once written, so its preview is fetched once. */
export function useRevisionPreview(publicId: string, number: number, key: string | null) {
  return useQuery({
    queryKey: [...revisionsQueryKey(publicId, number), key] as const,
    queryFn: async (): Promise<RevisionPreview> => {
      const res = await chapters[':number'].revisions[':key'].$get({
        param: { publicId, number: String(number), key: key ?? '' },
      });
      if (!res.ok) throw await readApiError(res);
      return (await res.json()).revision;
    },
    enabled: key !== null,
    staleTime: Infinity,
    retry: false,
  });
}

export async function restoreRevisionRequest(
  publicId: string,
  number: number,
  key: string,
  baseUpdatedAt: string,
): Promise<RestoredDraft> {
  const res = await chapters[':number'].revisions[':key'].restore.$post({
    param: { publicId, number: String(number), key },
    json: { baseUpdatedAt },
  });
  if (!res.ok) throw await readApiError(res);
  return (await res.json()).draft;
}
