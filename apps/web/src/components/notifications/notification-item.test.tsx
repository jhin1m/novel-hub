import type { NotificationDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NotificationItem, notificationText } from './notification-item';

const notification: NotificationDto = {
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
