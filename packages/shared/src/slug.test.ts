import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('bỏ dấu tiếng Việt và nối bằng gạch ngang', () => {
    expect(slugify('Kiếm Đạo Độc Tôn')).toBe('kiem-dao-doc-ton');
  });

  it('xử lý dấu chồng tầng và Đ hoa', () => {
    expect(slugify('ĐỖ ỘNG ẬP ỮNG Ỹ')).toBe('do-ong-ap-ung-y');
    expect(slugify('Những ngày mưa ở Đà Lạt')).toBe('nhung-ngay-mua-o-da-lat');
  });

  it('chuẩn hoá chuỗi đã ở dạng NFC lẫn NFD giống nhau', () => {
    const title = 'Thiên Hạ Đệ Nhất';
    expect(slugify(title.normalize('NFC'))).toBe(slugify(title.normalize('NFD')));
  });

  it('quy chữ Ð/ð trông giống Đ về d', () => {
    expect(slugify('Ðà Lạt ðẹp')).toBe('da-lat-dep');
  });

  it('thay ký tự đặc biệt và gộp khoảng trắng', () => {
    expect(slugify('  Hello,   World!!! — "Phần 2"  ')).toBe('hello-world-phan-2');
    expect(slugify('a___b...c')).toBe('a-b-c');
  });

  it('giữ chữ số', () => {
    expect(slugify('Năm 2026: Kỷ Nguyên Mới')).toBe('nam-2026-ky-nguyen-moi');
  });

  it('chuỗi không còn ký tự hợp lệ trả về slug dự phòng', () => {
    expect(slugify('')).toBe('truyen');
    expect(slugify('!!! ??? ***')).toBe('truyen');
    expect(slugify('漢字')).toBe('truyen');
  });

  it('cắt tối đa 60 ký tự tại ranh giới từ, không để gạch ngang cuối', () => {
    // 60 ký tự đầu kết thúc bằng `-`, ký tự thứ 61 mở đầu từ "sau" → bỏ từ đó, còn 59 ký tự.
    expect(slugify('Một hai ba bốn năm sáu bảy tám chín mười '.repeat(4))).toBe(
      'mot-hai-ba-bon-nam-sau-bay-tam-chin-muoi-mot-hai-ba-bon-nam',
    );
  });

  it('giữ nguyên từ khi ký tự thứ 61 là gạch ngang', () => {
    const word = 'a'.repeat(60);
    expect(slugify(`${word} tiep`)).toBe(word);
  });

  it('cắt cứng khi một từ dài hơn 60 ký tự', () => {
    expect(slugify('x'.repeat(80))).toBe('x'.repeat(60));
  });
});
