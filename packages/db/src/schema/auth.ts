import type { UserPreferences } from '@novel-hub/shared';
import { sql } from 'drizzle-orm';
import { boolean, check, index, jsonb, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { createdAt, timestamptz, updatedAt, uuidPk } from './columns';
import { userRole, userStatus } from './enums';

// Better Auth tra bảng theo key JS (`users`, `sessions`, `accounts`, `verifications`, bật
// `usePlural`). Core field `name`/`image` của Better Auth map sang `displayName`/`avatarUrl`.

export const users = pgTable(
  'users',
  {
    id: uuidPk(),
    /** Không bao giờ đổi được; nằm trong URL `/tac-gia/{username}`. */
    username: text().notNull(),
    displayName: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().notNull().default(false),
    avatarUrl: text(),
    bio: text(),
    role: userRole().notNull().default('reader'),
    status: userStatus().notNull().default('active'),
    /** Đọc ra luôn parse qua `userPreferencesSchema` để điền mặc định. */
    preferences: jsonb()
      .$type<Partial<UserPreferences>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('users_username_key').on(t.username),
    unique('users_email_key').on(t.email),
    check('users_username_format', sql`${t.username} ~ '^[a-z0-9_]{3,30}$'`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuidPk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull(),
    expiresAt: timestamptz().notNull(),
    ipAddress: text(),
    userAgent: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique('sessions_token_key').on(t.token), index('sessions_user_id_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: uuidPk(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text().notNull(),
    providerId: text().notNull(),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamptz(),
    refreshTokenExpiresAt: timestamptz(),
    scope: text(),
    /** Hash mật khẩu (provider `credential`). */
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique('accounts_provider_account_key').on(t.providerId, t.accountId),
    index('accounts_user_id_idx').on(t.userId),
  ],
);

/** Token xác thực email và đặt lại mật khẩu. */
export const verifications = pgTable(
  'verifications',
  {
    id: uuidPk(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamptz().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);
