import { z } from 'zod';
import { normalizePlainText } from '../plain-text';
import { isValidPublicId } from '../public-id';

/** `story_announcements.status`: `deleted` by its author, `hidden_by_mod` by a moderator. */
export const ANNOUNCEMENT_STATUSES = ['visible', 'deleted', 'hidden_by_mod'] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const ANNOUNCEMENT_RULES = {
  /** Code points after normalisation (`normalizePlainText`); the DB checks the same bound. */
  bodyMax: 1_000,
  /** Announcements one story may post per Vietnamese calendar day. */
  perStoryPerDay: 3,
  /** Latest announcements shown on the author page. */
  authorPageLimit: 3,
} as const;

/** Body of a new announcement; the text is normalised here, the raw input capped first. */
export const announcementCreateSchema = z
  .object({
    body: z
      .string()
      .max(ANNOUNCEMENT_RULES.bodyMax * 4)
      .transform((raw, ctx) => {
        const body = normalizePlainText(raw, ANNOUNCEMENT_RULES.bodyMax);
        if (body === null) {
          ctx.addIssue({ code: 'custom', message: 'Empty or too long' });
          return z.NEVER;
        }
        return body;
      }),
  })
  .strict();
export type AnnouncementCreateInput = z.output<typeof announcementCreateSchema>;

/** `:publicId/announcements/:id`: an announcement of one story; the UI never shows the id. */
export const announcementIdParamSchema = z.object({
  publicId: z.string().refine(isValidPublicId),
  id: z.uuid(),
});
