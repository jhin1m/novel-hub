import type { AuthorAnnouncementDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AuthorAnnouncements } from './author-announcements';
import { StoryAnnouncement } from './story-announcement';

const ID = '01920000-0000-7000-8000-000000000001';
const item: AuthorAnnouncementDto = {
  body: 'Tạm nghỉ hết tuần\n<b>không phải HTML</b>',
  createdAt: '2026-10-07T03:00:00.000Z',
  story: { publicId: 'k7m2xq9p', slug: 'kiem-dao-doc-ton', title: 'Kiếm Đạo Độc Tôn' },
};

describe('AuthorAnnouncements', () => {
  it('renders nothing without announcements', () => {
    expect(renderToStaticMarkup(<AuthorAnnouncements items={[]} />)).toBe('');
  });

  it('lists each announcement as text, linked to its story’s announcement section', () => {
    const html = renderToStaticMarkup(<AuthorAnnouncements items={[item]} />);
    expect(html).toContain('Thông báo mới');
    expect(html).toContain('href="/stories/kiem-dao-doc-ton-k7m2xq9p#announcements"');
    expect(html).toContain('Truyện: Kiếm Đạo Độc Tôn');
    expect(html).toContain('&lt;b&gt;không phải HTML&lt;/b&gt;');
    expect(html).toContain('Đăng 07/10/2026');
  });
});

describe('StoryAnnouncement', () => {
  it('renders the announcement under its heading, with the slot for a report button', () => {
    const html = renderToStaticMarkup(
      <StoryAnnouncement announcement={{ ...item, id: ID }}>
        <button type="button">Báo cáo</button>
      </StoryAnnouncement>,
    );
    expect(html).toContain('id="announcements"');
    expect(html).toContain('Thông báo của tác giả');
    expect(html).toContain('&lt;b&gt;không phải HTML&lt;/b&gt;');
    expect(html).toContain('<button type="button">Báo cáo</button>');
    // The internal id never reaches the page.
    expect(html).not.toContain(ID);
  });
});
