import type { HomeGenreTile } from '@novel-hub/core';
import {
  HOME_GENRE_TILE_COVERS,
  type HomeGenreTileSlug,
  canonicalPath,
  coverImageUrl,
} from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';
import type { CSSProperties } from 'react';
import { CoverBackdrop } from '../cover-backdrop';

/**
 * `base` is under every tile, cover or not: it holds the text's contrast while the backdrop loads,
 * and is all a genre without a cover shows. `--cover-fg` is AA on each (`tokens.test.ts`).
 */
const TILE_LOOKS: Record<HomeGenreTileSlug, { base: string; tagline: () => string }> = {
  'ngon-tinh': { base: 'var(--cover-7)', tagline: m.home_mood_tagline_romance },
  'tien-hiep': { base: 'var(--cover-4)', tagline: m.home_mood_tagline_xianxia },
  'kinh-di': { base: 'var(--cover-9)', tagline: m.home_mood_tagline_horror },
  'huyen-huyen': { base: 'var(--cover-5)', tagline: m.home_mood_tagline_fantasy },
};

/** Fanned out from the bottom right corner; the higher the slot, the closer to the corner. */
function fanSlotStyle(slot: number): CSSProperties {
  return { right: 14 + (2 - slot) * 54, transform: `rotate(${slot * 7 - 7}deg)`, zIndex: slot };
}

function GenreTile({ tile }: { tile: HomeGenreTile }) {
  const { base, tagline } = TILE_LOOKS[tile.slug];
  const [backdrop] = tile.coverUrls;
  // A genre with fewer covers keeps them against the corner instead of leaving the corner empty.
  const firstSlot = HOME_GENRE_TILE_COVERS - tile.coverUrls.length;
  return (
    <a
      href={canonicalPath({ kind: 'tag', slug: tile.slug })}
      style={{ backgroundColor: base }}
      className="relative isolate block min-h-[124px] overflow-hidden rounded-[20px] p-4 text-(--cover-fg) outline-none focus-visible:ring-[3px] focus-visible:ring-ring md:h-[232px] md:rounded-[24px] md:p-6"
    >
      {backdrop ? <CoverBackdrop coverUrl={backdrop} /> : null}
      {/* One line from `md`: at the narrowest column a wrapped name would run into the covers. */}
      <span className="relative block text-[27px] leading-[1.1] font-bold md:text-4xl md:leading-[1.1] md:whitespace-nowrap">
        {tile.name}
      </span>
      <span className="relative mt-2 block text-[13px] leading-[1.35] md:max-w-[200px] md:text-sm md:leading-[1.4]">
        {tagline()}
      </span>
      {tile.coverUrls.map((coverUrl, index) => (
        <img
          key={coverUrl}
          src={coverImageUrl(coverUrl, 300)}
          alt=""
          width={88}
          height={132}
          loading="lazy"
          decoding="async"
          style={fanSlotStyle(firstSlot + index)}
          className="absolute -bottom-[26px] hidden aspect-[2/3] w-[88px] rounded-[6px] object-cover shadow-[0_10px_20px_rgba(0,0,0,0.4)] md:block"
        />
      ))}
    </a>
  );
}

/** "What to read today": four genres, each a way into its tag page. */
export function HomeGenreTiles({ tiles }: { tiles: HomeGenreTile[] }) {
  return (
    <section aria-labelledby="mood-title">
      <h2
        id="mood-title"
        className="mb-3.5 text-[29px] leading-[1.24] font-bold tracking-[-0.02em] md:mb-[22px] md:text-4xl md:leading-[1.24]"
      >
        {m.home_mood_title_before()}
        <span className="text-primary">{m.home_mood_title_accent()}</span>
        {m.home_mood_title_after()}
      </h2>
      <div className="grid grid-cols-2 gap-2.5 md:grid-cols-[repeat(auto-fit,minmax(260px,1fr))] md:gap-4">
        {tiles.map((tile) => (
          <GenreTile key={tile.slug} tile={tile} />
        ))}
      </div>
    </section>
  );
}
