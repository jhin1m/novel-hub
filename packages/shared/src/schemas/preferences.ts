import { z } from 'zod';

/**
 * Cài đặt của người dùng, lưu ở `users.preferences` (jsonb). Giai đoạn 1 mở rộng thêm
 * cài đặt trang đọc. Mọi lần đọc ra đều parse qua schema này để điền giá trị mặc định.
 */
export const userPreferencesSchema = z.object({
  /** Hiện truyện 18+ ở các danh sách; chỉ tài khoản đã đăng nhập mới bật được. */
  showMature: z.boolean().default(false),
});

export type UserPreferences = z.infer<typeof userPreferencesSchema>;
