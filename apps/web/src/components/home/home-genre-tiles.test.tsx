import type { HomeGenreTile } from '@novel-hub/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { HomeGenreTiles } from './home-genre-tiles';

const cover = (name: string) => `https://cdn.example.com/covers/${name}-600.webp`;
const tile = (patch: Partial<HomeGenreTile> = {}): HomeGenreTile => ({
  slug: 'tien-hiep',
  name: 'Tiên hiệp',
  coverUrls: [],
  ...patch,
});

const render = (tiles: HomeGenreTile[]) => renderToStaticMarkup(<HomeGenreTiles tiles={tiles} />);
/** The small covers only: the backdrop is the one image without an explicit 88px width. */
const fanCovers = (html: string) => html.match(/<img[^>]*width="88"[^>]*>/g) ?? [];

describe('HomeGenreTiles', () => {
  it('titles the section with one accented word', () => {
    expect(render([tile()])).toContain('Hôm nay <span class="text-primary">đọc</span> gì?');
  });

  it('links each tile to its tag page, with its name and tagline', () => {
    const html = render([
      tile({ slug: 'ngon-tinh', name: 'Ngôn tình' }),
      tile(),
      tile({ slug: 'kinh-di', name: 'Kinh dị' }),
      tile({ slug: 'huyen-huyen', name: 'Huyền huyễn' }),
    ]);
    for (const slug of ['ngon-tinh', 'tien-hiep', 'kinh-di', 'huyen-huyen']) {
      expect(html).toContain(`href="/tags/${slug}"`);
    }
    expect(html).toContain('Ngôn tình');
    expect(html).toContain('Thương từ cái nhìn đầu');
    expect(html).toContain('Kiếm hiệp, tu tiên, một đường tới đỉnh');
    expect(html).toContain('Trinh thám, rùng rợn, đừng đọc một mình');
    expect(html).toContain('Khoa huyễn, phép thuật, thế giới khác');
  });

  it('without a cover: only the flat fallback colour of the genre, no image', () => {
    const colours = {
      'ngon-tinh': '--cover-7',
      'tien-hiep': '--cover-4',
      'kinh-di': '--cover-9',
      'huyen-huyen': '--cover-5',
    } as const;
    for (const [slug, token] of Object.entries(colours)) {
      const html = render([tile({ slug: slug as HomeGenreTile['slug'] })]);
      expect(html).toContain(`background-color:var(${token})`);
      expect(html).not.toContain('<img');
      expect(html).not.toContain('--hero-scrim');
    }
  });

  it('with covers: blurs the newest over the fallback colour and fans all three from md up', () => {
    const html = render([tile({ coverUrls: [cover('a'), cover('b'), cover('c')] })]);
    expect(html).toContain('background-color:var(--cover-4)');
    expect(html).toContain('bg-(--hero-scrim)');
    expect(html).toMatch(/<img[^>]*src="[^"]*a-300\.webp"[^>]*aria-hidden/);
    const fan = fanCovers(html);
    expect(fan).toHaveLength(3);
    for (const image of fan) {
      expect(image).toContain('alt=""');
      expect(image).toContain('hidden');
      expect(image).toContain('md:block');
      expect(image).toContain('loading="lazy"');
    }
    expect(fan[0]).toContain('a-300.webp');
    expect(fan[0]).toContain('right:122px;transform:rotate(-7deg);z-index:0');
    expect(fan[1]).toContain('right:68px;transform:rotate(0deg);z-index:1');
    expect(fan[2]).toContain('c-300.webp');
    expect(fan[2]).toContain('right:14px;transform:rotate(7deg);z-index:2');
  });

  it('keeps a shorter fan against the corner', () => {
    const fan = fanCovers(render([tile({ coverUrls: [cover('a')] })]));
    expect(fan).toHaveLength(1);
    expect(fan[0]).toContain('right:14px;transform:rotate(7deg);z-index:2');
  });

  it('uses no gradient and clips the blur with an isolated tile', () => {
    const html = render([tile({ coverUrls: [cover('a')] })]);
    expect(html).not.toMatch(/gradient|backdrop-/);
    expect(html).toMatch(/<a [^>]*class="relative isolate [^"]*overflow-hidden/);
  });
});
