import type {
  ChapterPublishedNotificationDto,
  NotificationDto,
  StoryAnnouncementNotificationDto,
  UserWarnedNotificationDto,
} from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotificationItem, notificationHref, notificationText } from './notification-item';

const notification: ChapterPublishedNotificationDto = {
  id: '01920000-0000-7000-8000-000000000001',
  type: 'chapter_published',
  story: {
    publicId: 'k7m2xq9p',
    slug: 'kiem-dao-doc-ton',
    title: 'Kiếm Đạo Độc Tôn',
    coverUrl: null,
    author: { username: 'lao_mac', displayName: 'Lão Mặc' },
    mainTag: { slug: 'tien-hiep', name: 'Tiên hiệp' },
    status: 'ongoing',
    chapterCount: 12,
    wordCount: 34_500,
    lastChapterAt: '2026-10-01T03:00:00.000Z',
    isAiAssisted: false,
    isMature: false,
  },
  count: 1,
  chapter: { number: 12, title: 'Xuống núi' },
  read: false,
  createdAt: '2026-10-06T03:00:00.000Z',
};

describe('NotificationItem', () => {
  it('links the chapter by its canonical path and names it', () => {
    const html = renderToStaticMarkup(<NotificationItem notification={notification} />);
    expect(html).toContain('href="/stories/kiem-dao-doc-ton-k7m2xq9p/chapter-12"');
    expect(html).toContain('Kiếm Đạo Độc Tôn có chương mới: Chương 12 – Xuống núi');
    expect(html).toContain('Chưa đọc');
    expect(html).not.toContain(notification.id);
  });

  it('counts grouped chapters and drops the unread mark once read', () => {
    const grouped = { ...notification, count: 3, read: true };
    expect(notificationText(grouped)).toBe('Kiếm Đạo Độc Tôn có 3 chương mới');
    expect(renderToStaticMarkup(<NotificationItem notification={grouped} />)).not.toContain(
      'Chưa đọc',
    );
    expect(notificationText({ ...notification, chapter: { number: 12, title: null } })).toBe(
      'Kiếm Đạo Độc Tôn có chương mới: Chương 12',
    );
  });
});

describe('NotificationItem for announcements and warnings', () => {
  const announcement: StoryAnnouncementNotificationDto = {
    id: '01920000-0000-7000-8000-000000000002',
    type: 'story_announcement',
    story: notification.story,
    excerpt: 'Tạm nghỉ đến hết tuần',
    read: false,
    createdAt: '2026-10-06T03:00:00.000Z',
  };
  const warning: UserWarnedNotificationDto = {
    id: '01920000-0000-7000-8000-000000000003',
    type: 'user_warned',
    reason: 'Bình luận <b>spam</b>',
    read: true,
    createdAt: '2026-10-06T03:00:00.000Z',
  };

  it('links an announcement to the announcements of its story and shows the excerpt', () => {
    const html = renderToStaticMarkup(<NotificationItem notification={announcement} />);
    expect(html).toContain('href="/stories/kiem-dao-doc-ton-k7m2xq9p#announcements"');
    expect(notificationText(announcement)).toBe('Kiếm Đạo Độc Tôn: tác giả có thông báo mới');
    expect(html).toContain('Tạm nghỉ đến hết tuần');
    expect(html).not.toContain(announcement.id);
  });

  it('links a warning to the content policy and shows the reason as text', () => {
    const html = renderToStaticMarkup(<NotificationItem notification={warning} />);
    expect(notificationHref(warning)).toBe('/content-policy');
    expect(html).toContain('href="/content-policy"');
    expect(html).toContain(
      'Bạn nhận một cảnh cáo từ ban kiểm duyệt: Bình luận &lt;b&gt;spam&lt;/b&gt;',
    );
    expect(html).toContain('Xem lại quy định nội dung');
    expect(html).not.toContain('<b>');
  });

  it('maps every type to its text and link', () => {
    const all: NotificationDto[] = [notification, announcement, warning];
    expect(all.map(notificationHref)).toEqual([
      '/stories/kiem-dao-doc-ton-k7m2xq9p/chapter-12',
      '/stories/kiem-dao-doc-ton-k7m2xq9p#announcements',
      '/content-policy',
    ]);
  });
});
