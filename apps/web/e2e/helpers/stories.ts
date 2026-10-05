import { type Page, expect } from '@playwright/test';

/** Creates a story through the API with the session of `page`; returns its public id. */
export async function createStory(page: Page, title = 'Truyện Thử Editor'): Promise<string> {
  const res = await page.request.post('/api/v1/stories', {
    data: { title, mainTag: 'tien-hiep' },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { story: { publicId: string } }).story.publicId;
}
