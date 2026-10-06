import { z } from 'zod';
import { LIMITS } from '../limits';
import { normalizePlainText } from '../plain-text';
import { isValidPublicId } from '../public-id';

/** Where a contest stands at a given moment; derived from its times, never stored. */
export const CONTEST_STATUSES = ['upcoming', 'open', 'ended'] as const;
export type ContestStatus = (typeof CONTEST_STATUSES)[number];

/** Places a moderator awards once a contest has ended. */
export const CONTEST_PLACEMENTS = [1, 2, 3] as const;
export type ContestPlacement = (typeof CONTEST_PLACEMENTS)[number];

export const CONTEST_RULES = {
  /** Entries per page of a contest page. */
  entriesPageSize: 24,
  /** Ended contests listed on `/contests`, most recently ended first. */
  endedListed: 20,
  /** Length the moderator form proposes. */
  defaultDays: 30,
} as const;

/** Why a story may not enter a contest (the author's panel explains each). */
export const CONTEST_INELIGIBLE_REASONS = ['not_published', 'mature', 'too_old'] as const;
export type ContestIneligibleReason = (typeof CONTEST_INELIGIBLE_REASONS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Where a contest running from `startsAt` to `endsAt` stands at `now`: `upcoming` before the start,
 * `open` from the start (inclusive) to the end (exclusive), `ended` from the end on.
 */
export function contestStatus(
  contest: { startsAt: Date | string; endsAt: Date | string },
  now: Date,
): ContestStatus {
  const t = now.getTime();
  if (new Date(contest.endsAt).getTime() <= t) return 'ended';
  return new Date(contest.startsAt).getTime() <= t ? 'open' : 'upcoming';
}

/** A contest slug in a URL: what `slugify` makes, plus the `-2`, `-3` suffix of a duplicate. */
export const contestSlugSchema = z
  .string()
  .max(70)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

/**
 * Body of `POST /api/v1/moderation/contests` and `PATCH /api/v1/moderation/contests/:id` (the form
 * always sends every field). The description is plain text, normalised here
 * (`normalizePlainText`); the raw input is capped first so normalising stays cheap.
 */
export const contestInputSchema = z
  .object({
    // NFC like story titles, so the same title typed on different keyboards counts the same.
    title: z
      .string()
      .trim()
      .normalize('NFC')
      .min(LIMITS.contestTitle.min)
      .max(LIMITS.contestTitle.max),
    description: z
      .string()
      .max(LIMITS.contestDescriptionMax * 4)
      .transform((raw, ctx) => {
        const text = normalizePlainText(raw, LIMITS.contestDescriptionMax);
        if (text !== null) return text;
        ctx.addIssue({ code: 'custom', message: 'Empty or too long' });
        return z.NEVER;
      }),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    path: ['endsAt'],
    message: 'Must end after it starts',
  })
  .refine((v) => Date.parse(v.endsAt) - Date.parse(v.startsAt) <= LIMITS.contestMaxDays * DAY_MS, {
    path: ['endsAt'],
    message: 'At most 180 days',
  });
export type ContestInput = z.output<typeof contestInputSchema>;

/** `:id` of the per-contest moderator routes. */
export const contestIdParamSchema = z.object({ id: z.uuid() });

const storyPublicId = z.string().refine(isValidPublicId);

/** `:slug/entries/:publicId` of the author's enter and withdraw routes. */
export const contestEntryParamSchema = z.object({
  slug: contestSlugSchema,
  publicId: storyPublicId,
});

/** Query of `GET /api/v1/contests/open`: the open contests as one of the author's stories sees them. */
export const contestOpenQuerySchema = z.object({ story: storyPublicId });

/** Body of `PUT /api/v1/moderation/contests/:id/placements`: places an entry, or clears it (`null`). */
export const contestPlacementSchema = z.object({
  story: storyPublicId,
  placement: z.union([z.literal(1), z.literal(2), z.literal(3), z.null()]),
});
export type ContestPlacementInput = z.output<typeof contestPlacementSchema>;

/** A contest as lists show it. */
export interface ContestSummaryDto {
  slug: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: ContestStatus;
  /** Entries shown on the contest page (public stories only). */
  entryCount: number;
}

/** `/contests`: running (ending soonest first), upcoming (starting soonest first), recently ended. */
export interface ContestListDto {
  open: ContestSummaryDto[];
  upcoming: ContestSummaryDto[];
  ended: ContestSummaryDto[];
}

/** An open contest on the author's story page: whether this story is in and whether it may enter. */
export interface OpenContestForStoryDto {
  slug: string;
  title: string;
  endsAt: string;
  entered: boolean;
  eligible: boolean;
  reason?: ContestIneligibleReason;
}

/** A contest in the moderator list. `id` names it in the API only; the UI never shows it. */
export interface ContestAdminDto extends ContestSummaryDto {
  id: string;
  description: string;
}

/** An entry as the moderator ranks it. */
export interface ContestAdminEntryDto {
  story: {
    publicId: string;
    slug: string;
    title: string;
    coverUrl: string | null;
    authorName: string;
    mainTagSlug: string;
  };
  enteredAt: string;
  placement: ContestPlacement | null;
  /** Shown on the contest page; an entry no longer listed cannot be placed, only cleared. */
  listed: boolean;
}
