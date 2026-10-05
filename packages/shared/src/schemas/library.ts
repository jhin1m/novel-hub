import { z } from 'zod';
import { isValidPublicId } from '../public-id';

/** Shelves of a reader's library, in the order of the `library_shelf` enum in the database. */
export const SHELVES = ['reading', 'plan', 'done', 'dropped'] as const;
export const shelfSchema = z.enum(SHELVES);
export type Shelf = (typeof SHELVES)[number];

/** Stories per page of a library shelf. */
export const LIBRARY_PAGE_SIZE = 20;

/** Entries per page of the reading history. */
export const HISTORY_PAGE_SIZE = 20;

/** Query of `GET /api/v1/library`. A bad page falls back to the first one. */
export const libraryListQuery = z.object({
  shelf: shelfSchema,
  page: z.coerce.number().int().min(1).max(500).catch(1),
});

export type LibraryListQuery = z.output<typeof libraryListQuery>;

/** Body of `PUT /api/v1/library/:publicId`. */
export const setShelfInput = z.object({ shelf: shelfSchema });

/**
 * Keyset cursor of the reading history: `${updatedAtMicros}_${publicId}` of the last entry shown.
 * Microseconds, the precision Postgres stores, so entries a millisecond apart are never skipped.
 * Opaque to the client, which only sends back what the previous page returned.
 */
export const historyCursorSchema = z
  .string()
  .regex(/^\d{1,17}_[a-z2-9]{8}$/)
  .optional();

/** Query of `GET /api/v1/reading/history`. */
export const historyQuery = z.object({ cursor: historyCursorSchema });

/** `:publicId` of the library and history routes. */
export const publicIdParamSchema = z.object({ publicId: z.string().refine(isValidPublicId) });

/** Tabs of the `/library` page: the four shelves plus the reading history. */
export const LIBRARY_TABS = [...SHELVES, 'history'] as const;
export type LibraryTab = (typeof LIBRARY_TABS)[number];
export const libraryTabSchema = z.enum(LIBRARY_TABS);
