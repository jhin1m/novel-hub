import { describe, expect, it } from 'vitest';
import { filterChapters, orderChapters } from './toc';

const numbered = (...numbers: number[]) => numbers.map((number) => ({ number, title: null }));
const numbers = (chapters: { number: number }[]) => chapters.map((chapter) => chapter.number);

describe('filterChapters', () => {
  const chapters = numbered(1, 2, 9, 10, 11, 12, 21, 120, 1200);

  it('keeps every chapter for a blank query', () => {
    expect(numbers(filterChapters(chapters, ''))).toEqual(numbers(chapters));
    expect(numbers(filterChapters(chapters, '   '))).toEqual(numbers(chapters));
  });

  it('matches chapter numbers by prefix for a digits-only query', () => {
    expect(numbers(filterChapters(chapters, '1'))).toEqual([1, 10, 11, 12, 120, 1200]);
    expect(numbers(filterChapters(chapters, '12'))).toEqual([12, 120, 1200]);
    expect(numbers(filterChapters(chapters, ' 012 '))).toEqual([12, 120, 1200]);
    expect(filterChapters(chapters, '0')).toEqual([]);
    expect(filterChapters(chapters, '3')).toEqual([]);
  });

  it('matches titles without accents or case', () => {
    const titled = [
      { number: 1, title: 'Kiếm Đạo khởi đầu' },
      { number: 2, title: 'Ðêm mưa' },
      { number: 3, title: null },
      { number: 4, title: 'Hồi kết' },
    ];
    expect(numbers(filterChapters(titled, 'kiem'))).toEqual([1]);
    expect(numbers(filterChapters(titled, 'KIẾM ĐẠO'))).toEqual([1]);
    expect(numbers(filterChapters(titled, 'dao'))).toEqual([1]);
    // `Ð` (U+00D0) looks like `Đ` and folds the same way, in a title and in a query.
    expect(numbers(filterChapters(titled, 'dem'))).toEqual([2]);
    expect(numbers(filterChapters(titled, 'Ðêm'))).toEqual([2]);
    expect(numbers(filterChapters(titled, 'ket'))).toEqual([4]);
    expect(filterChapters(titled, 'rồng')).toEqual([]);
  });

  it('treats runs of whitespace in a title like single spaces', () => {
    const titled = [{ number: 1, title: 'Đêm  mưa\tlạnh' }];
    expect(numbers(filterChapters(titled, 'dem mua lanh'))).toEqual([1]);
  });

  it('matches the "Chương N" label, untitled chapters included', () => {
    const titled = [
      { number: 3, title: null },
      { number: 30, title: 'Ba mươi' },
      { number: 4, title: 'Bốn' },
    ];
    expect(numbers(filterChapters(titled, 'chuong 3'))).toEqual([3, 30]);
    expect(numbers(filterChapters(titled, 'Chương   4'))).toEqual([4]);
  });

  it('does not change the list it is given', () => {
    const list = numbered(1, 2, 3);
    filterChapters(list, '2');
    expect(numbers(list)).toEqual([1, 2, 3]);
  });
});

describe('orderChapters', () => {
  it('sorts oldest or newest first without changing the list it is given', () => {
    const list = numbered(1, 2, 4, 3);
    expect(numbers(orderChapters(list, 'oldest'))).toEqual([1, 2, 3, 4]);
    expect(numbers(orderChapters(list, 'newest'))).toEqual([4, 3, 2, 1]);
    expect(numbers(list)).toEqual([1, 2, 4, 3]);
  });
});
