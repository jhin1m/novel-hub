import { z } from 'zod';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const DISPLAY_NAME_MAX_LENGTH = 50;

/** Khớp CHECK `users_username_format` trong DB. */
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

/**
 * Username không cho đăng ký: dễ bị dùng để giả mạo ban quản trị hoặc hệ thống.
 * Username không đổi được, nên chặn từ lúc tạo.
 */
export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  'admin',
  'administrator',
  'mod',
  'moderator',
  'root',
  'system',
  'support',
  'staff',
  'api',
  'auth',
  'novelhub',
  'novel_hub',
  'null',
  'undefined',
]);

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(USERNAME_PATTERN)
  .refine((value) => !RESERVED_USERNAMES.has(value), { message: 'Username đã được hệ thống giữ' });

/** `users.display_name` (field `name` của Better Auth): bỏ khoảng trắng hai đầu, 1–50 ký tự. */
export const displayNameSchema = z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH);
