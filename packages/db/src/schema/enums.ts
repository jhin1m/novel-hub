import { pgEnum } from 'drizzle-orm/pg-core';

// Chỉ dùng `pgEnum` cho tập giá trị spec đã cố định: Postgres không xoá hay đổi tên được
// giá trị enum. Tập còn mở (báo cáo, kiểm duyệt, trạng thái bình luận) dùng `text` + Zod.

export const userRole = pgEnum('user_role', ['reader', 'author', 'mod', 'admin']);
export const userStatus = pgEnum('user_status', ['active', 'muted', 'banned']);
export const storyStatus = pgEnum('story_status', ['ongoing', 'completed', 'hiatus']);
export const storyVisibility = pgEnum('story_visibility', ['draft', 'published', 'hidden_by_mod']);
export const tagKind = pgEnum('tag_kind', ['genre', 'theme', 'warning']);
export const chapterStatus = pgEnum('chapter_status', [
  'draft',
  'scheduled',
  'published',
  'hidden_by_mod',
]);
export const followTarget = pgEnum('follow_target', ['story', 'user']);
export const libraryShelf = pgEnum('library_shelf', ['reading', 'plan', 'done', 'dropped']);
