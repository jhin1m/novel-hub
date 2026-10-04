const MAX_SLUG_LENGTH = 60;

/** Slug dự phòng khi tiêu đề không còn ký tự hợp lệ nào, tránh URL dạng `/truyen/-abc`. */
const FALLBACK_SLUG = 'truyen';

/**
 * Sinh slug từ tiêu đề tiếng Việt: bỏ dấu (gồm `đ` → `d`), chữ thường, nối bằng `-`,
 * cắt tối đa 60 ký tự tại ranh giới `-` gần nhất. Slug không cần duy nhất.
 */
export function slugify(input: string): string {
  const slug = input
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    // `ð`/`Ð` (U+00F0/U+00D0) trông giống hệt `đ`/`Đ` nên cũng quy về `d`.
    .replace(/[đĐðÐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length === 0) return FALLBACK_SLUG;
  if (slug.length <= MAX_SLUG_LENGTH) return slug;

  // Lấy thêm 1 ký tự để biết ký tự thứ 60 có nằm ngay trước một `-` hay không.
  const head = slug.slice(0, MAX_SLUG_LENGTH + 1);
  const lastDash = head.lastIndexOf('-');
  // Cắt tại ranh giới từ; một "từ" dài hơn 60 ký tự thì cắt cứng.
  return lastDash > 0 ? head.slice(0, lastDash) : slug.slice(0, MAX_SLUG_LENGTH);
}
