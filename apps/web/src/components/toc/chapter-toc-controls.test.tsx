import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChapterTocControls } from './chapter-toc-controls';

const noop = () => {};
const render = (props: Partial<Parameters<typeof ChapterTocControls>[0]> = {}) =>
  renderToStaticMarkup(
    <ChapterTocControls
      query=""
      onQueryChange={noop}
      order="oldest"
      onOrderChange={noop}
      matchCount={null}
      {...props}
    />,
  );
/** `aria-pressed` of the order buttons, by label. */
const pressed = (html: string): Record<string, string | undefined> =>
  Object.fromEntries(
    [...html.matchAll(/aria-pressed="(true|false)"[^>]*>([^<]+)</g)].map(
      (match): [string, string | undefined] => [match[2] ?? '', match[1]],
    ),
  );

describe('ChapterTocControls', () => {
  it('labels the search box and the order group', () => {
    const html = render();
    expect(html).toMatch(/<label[^>]*>Tìm chương<\/label>/);
    expect(html).toContain('type="search"');
    expect(html).toContain('placeholder="Số hoặc tên chương"');
    expect(html).toContain('role="group" aria-label="Thứ tự chương"');
  });

  it('presses the button of the current order', () => {
    expect(pressed(render({ order: 'oldest' }))).toEqual({
      'Cũ trước': 'true',
      'Mới trước': 'false',
    });
    expect(pressed(render({ order: 'newest' }))).toEqual({
      'Cũ trước': 'false',
      'Mới trước': 'true',
    });
  });

  it('shows the jump button only with a handler', () => {
    expect(render()).not.toContain('Đến chương đang đọc');
    expect(render({ onJumpToCurrent: noop })).toContain('Đến chương đang đọc');
  });

  it('counts matches while searching', () => {
    expect(render()).not.toContain('khớp');
    expect(render({ query: '1', matchCount: 4 })).toContain('4 chương khớp');
    expect(render({ query: 'x', matchCount: 0 })).toContain('Không có chương nào khớp.');
  });
});
