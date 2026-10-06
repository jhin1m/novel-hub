import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { StarInput } from './star-input';

describe('StarInput', () => {
  it('renders five radios in one group named "{n} sao", the choice checked', () => {
    const html = renderToStaticMarkup(<StarInput value={4} onChange={() => {}} />);
    expect(html).toContain('<fieldset');
    expect(html).toContain('Chấm điểm truyện');
    const radios = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map((r) => r[0]);
    expect(radios).toHaveLength(5);
    expect(new Set(radios.map((r) => /name="([^"]+)"/.exec(r)?.[1])).size).toBe(1);
    expect(radios.filter((r) => r.includes('checked'))).toEqual([
      expect.stringContaining('value="4"'),
    ]);
    for (const n of [1, 2, 3, 4, 5]) expect(html).toContain(`${n} sao`);
  });

  it('disables the group', () => {
    const html = renderToStaticMarkup(<StarInput value={null} onChange={() => {}} disabled />);
    expect(html).toMatch(/<fieldset[^>]*disabled/);
    expect(html).not.toContain('checked');
  });
});
