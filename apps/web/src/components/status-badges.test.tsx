import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ChapterStatusBadge,
  StoryFlagBadges,
  StoryStatusBadge,
  StoryVisibilityBadge,
} from './status-badges';

/** `data-variant` and text of every badge in the markup, in order. */
function badges(html: string): [string, string][] {
  return [...html.matchAll(/data-variant="([a-z]+)"[^>]*>([^<]*)</g)].map((match) => [
    match[1] ?? '',
    match[2] ?? '',
  ]);
}

describe('status badges', () => {
  it('maps story status to its label and look', () => {
    expect(badges(renderToStaticMarkup(<StoryStatusBadge status="ongoing" />))).toEqual([
      ['default', 'Đang ra'],
    ]);
    expect(badges(renderToStaticMarkup(<StoryStatusBadge status="completed" />))).toEqual([
      ['secondary', 'Hoàn thành'],
    ]);
    expect(badges(renderToStaticMarkup(<StoryStatusBadge status="hiatus" />))).toEqual([
      ['warning', 'Tạm ngưng'],
    ]);
  });

  it('maps story visibility to its look', () => {
    expect(
      badges(renderToStaticMarkup(<StoryVisibilityBadge visibility="published" />))[0]?.[0],
    ).toBe('default');
    expect(badges(renderToStaticMarkup(<StoryVisibilityBadge visibility="draft" />))[0]?.[0]).toBe(
      'muted',
    );
    expect(
      badges(renderToStaticMarkup(<StoryVisibilityBadge visibility="hidden_by_mod" />))[0]?.[0],
    ).toBe('destructive');
  });

  it('maps chapter status to its label and look', () => {
    expect(badges(renderToStaticMarkup(<ChapterStatusBadge status="published" />))).toEqual([
      ['default', 'Đã đăng'],
    ]);
    expect(badges(renderToStaticMarkup(<ChapterStatusBadge status="draft" />))).toEqual([
      ['muted', 'Nháp'],
    ]);
    expect(badges(renderToStaticMarkup(<ChapterStatusBadge status="scheduled" />))).toEqual([
      ['warning', 'Hẹn giờ'],
    ]);
    expect(
      badges(renderToStaticMarkup(<ChapterStatusBadge status="hidden_by_mod" />))[0]?.[0],
    ).toBe('destructive');
  });

  it('shows the AI and 18+ flags only when set, one node each', () => {
    expect(renderToStaticMarkup(<StoryFlagBadges isAiAssisted={false} isMature={false} />)).toBe(
      '',
    );
    expect(badges(renderToStaticMarkup(<StoryFlagBadges isAiAssisted isMature />))).toEqual([
      ['outline', 'Có dùng AI'],
      ['destructive', '18+'],
    ]);
  });
});
