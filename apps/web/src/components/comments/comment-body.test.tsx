import type { CommentDto } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CommentBody, commentOwnAction } from './comment-body';

const comment: CommentDto = {
  id: '01920000-0000-7000-8000-000000000001',
  body: '<script>alert(1)</script>\nDòng hai',
  createdAt: '2026-10-06T00:00:00.000Z',
  author: { username: 'doc_gia', displayName: 'Độc Giả' },
  isOwn: false,
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
});

describe('commentOwnAction', () => {
  it('lets the writer delete and everyone else report', () => {
    expect(commentOwnAction({ isOwn: true })).toBe('delete');
    expect(commentOwnAction({ isOwn: false })).toBe('report');
  });
});
