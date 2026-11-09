import { expect, test } from '@playwright/test';

test('content policy lists the chapter, external link, AI and warning rules before reporting', async ({
  page,
}) => {
  const response = await page.goto('/content-policy');
  expect(response?.status()).toBe(200);

  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    'Nội dung bị cấm',
    'Bản quyền và đạo văn',
    'Nội dung 18+',
    'Gắn tag đúng',
    'Chương truyện',
    'Không kéo người đọc ra ngoài',
    'Khai báo dùng AI',
    'Cảnh cáo và xử lý',
    'Báo cáo vi phạm',
  ]);
});
