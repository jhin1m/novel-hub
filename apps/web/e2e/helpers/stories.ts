import { type Page, expect } from '@playwright/test';

/** Creates a story through the API with the session of `page`; returns its public id. */
export async function createStory(page: Page, title = 'Truyện Thử Editor'): Promise<string> {
  const res = await page.request.post('/api/v1/stories', {
    data: { title, mainTag: 'tien-hiep' },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { story: { publicId: string } }).story.publicId;
}

/** Creates the next chapter of a story through the API; returns its number. */
export async function createChapter(page: Page, publicId: string): Promise<number> {
  // A body-less POST counts as a form submit for the CSRF check, which wants a same-origin header.
  const res = await page.request.post(`/api/v1/stories/${publicId}/chapters`, {
    headers: { origin: new URL(page.url()).origin },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { chapter: { number: number } }).chapter.number;
}

/** Saves `text` as one paragraph of the chapter draft, then publishes it, as the editor would. */
export async function publishChapterViaApi(
  page: Page,
  publicId: string,
  number: number,
  text: string,
): Promise<void> {
  const path = `/api/v1/stories/${publicId}/chapters/${number}`;
  const draft = await page.request.get(`${path}/draft`);
  expect(draft.status()).toBe(200);
  const { updatedAt } = (await draft.json()) as { updatedAt: string };
  const saved = await page.request.put(`${path}/draft`, {
    data: {
      doc: {
        type: 'doc',
        content: [{ type: 'paragraph', attrs: { pid: null }, content: [{ type: 'text', text }] }],
      },
      baseUpdatedAt: updatedAt,
    },
  });
  expect(saved.status()).toBe(200);
  const published = await page.request.post(`${path}/publish`, {
    data: { baseUpdatedAt: ((await saved.json()) as { updatedAt: string }).updatedAt },
  });
  expect(published.status()).toBe(200);
}
