import type { CommentDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommentBody, canEditComment, commentOwnAction, commentPinAction } from './comment-body';

const comment: CommentDto = {
  id: '01920000-0000-7000-8000-000000000001',
  body: '<script>alert(1)</script>\nDòng hai',
  createdAt: '2026-10-06T00:00:00.000Z',
  author: { username: 'doc_gia', displayName: 'Độc Giả' },
  isOwn: false,
  pinnedAt: null,
  editedAt: null,
};

describe('CommentBody', () => {
  it('renders the body as text, never as HTML, and keeps line breaks', () => {
    const html = renderToStaticMarkup(<CommentBody comment={comment} />);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('whitespace-pre-line');
    expect(html).toContain('href="/authors/doc_gia"');
    expect(html).toContain('Độc Giả');
    expect(html).not.toContain(comment.id);
  });

  it('marks a comment pinned and edited only when it is', () => {
    const plain = renderToStaticMarkup(<CommentBody comment={comment} />);
    expect(plain).not.toContain('Đã ghim');
    expect(plain).not.toContain('đã sửa');

    const html = renderToStaticMarkup(
      <CommentBody
        comment={{
          ...comment,
          pinnedAt: '2026-10-07T00:00:00.000Z',
          editedAt: '2026-10-07T01:00:00.000Z',
        }}
      />,
    );
    expect(html).toContain('Đã ghim');
    expect(html).toContain('đã sửa');
  });
});

describe('comment actions', () => {
  it('lets the writer delete and edit, and everyone else report', () => {
    expect(commentOwnAction({ isOwn: true })).toBe('delete');
    expect(commentOwnAction({ isOwn: false })).toBe('report');
    expect(canEditComment({ isOwn: true })).toBe(true);
    expect(canEditComment({ isOwn: false })).toBe(false);
  });

  it('offers pinning only to a viewer who may pin', () => {
    expect(commentPinAction({ pinnedAt: null }, false)).toBeNull();
    expect(commentPinAction({ pinnedAt: '2026-10-07T00:00:00.000Z' }, false)).toBeNull();
    expect(commentPinAction({ pinnedAt: null }, true)).toBe('pin');
    expect(commentPinAction({ pinnedAt: '2026-10-07T00:00:00.000Z' }, true)).toBe('unpin');
  });
});
