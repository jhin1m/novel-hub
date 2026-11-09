import type { ContestSummaryDto } from '@novel-hub/shared';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeWriteBand } from './home-write-band';

const contest = (slug: string, title: string): ContestSummaryDto => ({
  slug,
  title,
  startsAt: '2026-10-01T01:00:00.000Z',
  endsAt: '2026-10-31T01:00:00.000Z',
  status: 'open',
  entryCount: 3,
});

const render = (contests: ContestSummaryDto[]) =>
  renderToStaticMarkup(<HomeWriteBand contests={contests} />);

describe('HomeWriteBand', () => {
  it('shows the running contests, a link to every contest and the invitation to write', () => {
    const html = render([contest('mua-thu', 'Mùa Thu'), contest('mua-dong', 'Mùa Đông')]);
    expect(html).toMatch(/<h2 id="write-band-title"[^>]*>Cuộc thi đang diễn ra</);
    expect(html).toMatch(/href="\/contests\/mua-thu"[^>]*>Mùa Thu</);
    expect(html).toMatch(/href="\/contests\/mua-dong"[^>]*>Mùa Đông</);
    expect(html).toContain('Kết thúc 08:00 31/10/2026 · 3 bài dự thi');
    expect(html).toMatch(/href="\/contests"[^>]*>Xem mọi cuộc thi</);
    expect(html).toMatch(/<h3[^>]*>Bắt đầu viết truyện của bạn</);
    expect(html).toMatch(/href="\/write"[^>]*>Bắt đầu viết</);
    expect(html).not.toContain('<img');
  });

  it('keeps only the invitation, titling the band, without a running contest', () => {
    const html = render([]);
    expect(html).toMatch(
      /<h2 id="write-band-title"[^>]*>Có truyện muốn <span class="text-primary">kể<\/span>\?<\/h2>/,
    );
    expect(html).not.toContain('<h3');
    expect(html).not.toContain('Cuộc thi đang diễn ra');
    expect(html).not.toContain('href="/contests');
    expect(html).toMatch(/href="\/write"[^>]*>Bắt đầu viết</);
  });
});
