import { createTestDb } from '@novel-hub/db/testing';
import { expect, test } from '@playwright/test';

// Unique to this run: other specs share the test database and may leave contests running.
const run = Date.now().toString(36);
const open = { slug: `dang-mo-${run}`, title: `Đang Mở ${run}` };
const ended = { slug: `da-xong-${run}`, title: `Đã Xong ${run}` };

async function sql(query: string, params: unknown[] = []): Promise<void> {
  const { pool } = createTestDb();
  try {
    await pool.query(query, params);
  } finally {
    await pool.end();
  }
}

test.beforeAll(async () => {
  // The running contest ends within the hour, so it sorts first among the home page's two.
  await sql(
    `with creator as (
       insert into users (username, display_name, email, email_verified, role)
       values ($1, $1, $1 || '@example.com', true, 'mod')
       returning id
     )
     insert into contests (slug, title, description, starts_at, ends_at, created_by)
     select $2, $3, 'Chủ đề.', now() - interval '1 hour', now() + interval '1 hour', creator.id
       from creator
     union all
     select $4, $5, 'Chủ đề.', now() - interval '3 days', now() - interval '1 hour', creator.id
       from creator`,
    [`cm_${run}`, open.slug, open.title, ended.slug, ended.title],
  );
});

test.afterAll(async () => {
  await sql('delete from contests where slug = any($1)', [[open.slug, ended.slug]]);
});

test('the home page closes on the running contests and an invitation to write, cached for guests', async ({
  page,
}) => {
  const res = await page.goto('/');
  expect(res?.headers()['cache-control']).toContain('public');
  expect(res?.headers()['set-cookie']).toBeUndefined();

  const band = page.getByRole('region', { name: 'Cuộc thi đang diễn ra' });
  await expect(band.getByRole('link', { name: open.title })).toHaveAttribute(
    'href',
    `/contests/${open.slug}`,
  );
  await expect(band.getByText(ended.title)).toHaveCount(0);
  await expect(band.getByRole('link', { name: 'Xem mọi cuộc thi' })).toHaveAttribute(
    'href',
    '/contests',
  );
  await expect(band.getByRole('link', { name: 'Bắt đầu viết', exact: true })).toHaveAttribute(
    'href',
    '/write',
  );
  await expect(band.locator('img')).toHaveCount(0);
});
