import { DEDUPE } from '@novel-hub/shared';
import { describe, expect, it } from 'vitest';
import { h32 } from './hash';
import { lshKeys } from './lsh';
import { jaccardEstimate, minhash } from './minhash';
import { normalizeForDedupe, shingles } from './normalize';
import { hamming64, simhash } from './simhash';

const SYLLABLES = (
  'kiếm đạo độc tôn thiên hạ vô song lâm phong nguyệt hoa sơn thủy long hổ tâm ma ' +
  'thần tiên nhân gian trời đất mưa gió đêm ngày người ta hắn nàng đi về nhìn thấy'
).split(' ');

/** Deterministic pseudo-random text of `count` words (LCG), different per `seed`. */
function words(count: number, seed: number): string[] {
  let state = seed >>> 0;
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return SYLLABLES[state % SYLLABLES.length] as string;
  });
}

function signature(tokens: string[]) {
  const set = shingles(tokens);
  return { mh: minhash(set), sh: simhash(set) };
}

describe('normalizeForDedupe', () => {
  it('ignores case, punctuation and repeated spaces', () => {
    expect(normalizeForDedupe('Kiếm  Đạo,')).toEqual(normalizeForDedupe('kiếm đạo'));
    expect(normalizeForDedupe('«Kiếm» — Đạo!!! 2026')).toEqual(['kiếm', 'đạo', '2026']);
  });

  it('matches decomposed (NFD) and composed (NFC) diacritics', () => {
    const composed = 'Thiên hạ vô song';
    expect(normalizeForDedupe(composed.normalize('NFD'))).toEqual(normalizeForDedupe(composed));
  });

  it('is not fooled by invisible characters or fullwidth forms', () => {
    const plain = normalizeForDedupe('Kiếm đạo 2026');
    expect(normalizeForDedupe('Ki\u200bếm đ\u00adạo\u200d ２０２６')).toEqual(plain);
  });
});

describe('shingles', () => {
  it('keeps distinct runs of five words', () => {
    const set = shingles('a b c d e f a b c d e'.split(' '));
    expect(set.size).toBe(6);
    expect(set.has('a b c d e')).toBe(true);
  });

  it('turns a text shorter than five words into one shingle, and nothing into none', () => {
    expect([...shingles(['một', 'hai'])]).toEqual(['một hai']);
    expect(shingles([]).size).toBe(0);
  });
});

describe('similarity', () => {
  const original = words(2_000, 7);

  it('scores identical texts as near-identical', () => {
    const a = signature(original);
    const b = signature([...original]);
    expect(jaccardEstimate(a.mh, b.mh)).toBe(1);
    expect(hamming64(a.sh, b.sh)).toBeLessThanOrEqual(3);
  });

  it('scores unrelated texts low', () => {
    const a = signature(original);
    const b = signature(words(2_000, 99));
    expect(jaccardEstimate(a.mh, b.mh)).toBeLessThan(0.1);
  });

  it('still flags a copy with 10% of the words rewritten in four contiguous passages', () => {
    const edited = [...original];
    const replacement = words(200, 1234);
    for (let block = 0; block < 4; block++) {
      for (let i = 0; i < 50; i++) edited[block * 500 + i] = replacement[block * 50 + i] as string;
    }
    const a = signature(original);
    const b = signature(edited);
    expect(jaccardEstimate(a.mh, b.mh)).toBeGreaterThanOrEqual(DEDUPE.jaccard);
  });

  it('misses edits spread through the whole text (known limit of 5-word shingles)', () => {
    // One word in ten changed touches half of all shingles: Jaccard falls to about 0.33.
    const edited = original.map((word, i) => (i % 10 === 0 ? `${word}x` : word));
    const a = signature(original);
    const b = signature(edited);
    expect(jaccardEstimate(a.mh, b.mh)).toBeLessThan(DEDUPE.jaccard);
  });

  it('fingerprints a 20,000-word chapter quickly', () => {
    const long = words(20_000, 3);
    const started = performance.now();
    const { mh } = signature(long);
    lshKeys(mh);
    expect(performance.now() - started).toBeLessThan(200);
  });
});

describe('hamming64', () => {
  it('counts differing bits across the sign bit', () => {
    expect(hamming64(0n, 0n)).toBe(0);
    expect(hamming64(0n, -1n)).toBe(64);
    expect(hamming64(1n, 3n)).toBe(1);
  });
});

describe('frozen hash functions', () => {
  // Stored fingerprints depend on these exact values: a failing snapshot means the hash changed.
  const set = shingles(
    normalizeForDedupe('Kiếm đạo độc tôn, thiên hạ vô song. Lâm Phong nhìn trời.'),
  );

  it('keeps h32 stable', () => {
    expect([h32(''), h32('kiếm đạo'), h32('kiếm đạo', 1)]).toMatchInlineSnapshot(`
      [
        2872998923,
        1292681350,
        4006945451,
      ]
    `);
  });

  it('keeps the MinHash signature and LSH keys stable', () => {
    const mh = minhash(set);
    expect(mh).toHaveLength(DEDUPE.perms);
    expect(Array.from(mh.slice(0, 8))).toMatchInlineSnapshot(`
      [
        141877118,
        375606430,
        225266278,
        1002615492,
        400727678,
        1068607859,
        533046646,
        26823222,
      ]
    `);
    expect(lshKeys(mh)).toMatchInlineSnapshot(`
      [
        483194939,
        -39526784,
        1513867167,
        -1292371595,
        -1172889656,
        -408926652,
        -313717785,
        -894335698,
        -144017425,
        2091515504,
        1875574671,
        -456836294,
        1374018972,
        -1561989390,
        -562718564,
        153378373,
      ]
    `);
  });

  it('keeps the SimHash stable and inside a signed 64-bit integer', () => {
    const value = simhash(set);
    expect(value).toBe(BigInt.asIntN(64, value));
    expect(value).toMatchInlineSnapshot(`4623526464397019872n`);
  });
});
