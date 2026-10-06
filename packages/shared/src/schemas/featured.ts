import { z } from 'zod';
import { isValidPublicId } from '../public-id';
import { parseStoryKey } from '../story-key';

/**
 * `featured_slots.slot` values. One for now: the "featured stories" block of the home page; the
 * column is text so another place can be added without a migration.
 */
export const FEATURED_SLOTS = ['home_picks'] as const;
export type FeaturedSlot = (typeof FEATURED_SLOTS)[number];

export const FEATURED_RULES = {
  /** Stories the home block shows at most. */
  homeLimit: 12,
  /** Longest a slot may run. */
  maxDays: 90,
  /** Length the moderator form proposes. */
  defaultDays: 7,
  /** How far back the moderator list shows ended slots. */
  endedListDays: 30,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The story public id in what a moderator pasted: a bare public id, a `{slug}-{publicId}` key or
 * a story/chapter link (absolute or a path). `null` when none can be read.
 */
export function parseStoryRef(raw: string): string | null {
  const value = raw.trim();
  if (isValidPublicId(value)) return value;
  let path = value;
  try {
    path = new URL(value).pathname;
  } catch {
    // Not an absolute URL: a path or a bare key.
  }
  const match = /(?:^|\/)stories\/([^/?#]+)/.exec(path);
  return parseStoryKey(match?.[1] ?? path)?.publicId ?? null;
}

/** Body of `POST /api/v1/moderation/featured`: the story and when it is featured (ISO with offset). */
export const featuredSlotCreateSchema = z
  .object({
    story: z
      .string()
      .max(500)
      .transform((value, ctx) => {
        const publicId = parseStoryRef(value);
        if (!publicId) {
          ctx.addIssue({ code: 'custom', message: 'Not a story link or public id' });
          return z.NEVER;
        }
        return publicId;
      }),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .refine((v) => Date.parse(v.endsAt) > Date.parse(v.startsAt), {
    path: ['endsAt'],
    message: 'Must end after it starts',
  })
  .refine((v) => Date.parse(v.endsAt) - Date.parse(v.startsAt) <= FEATURED_RULES.maxDays * DAY_MS, {
    path: ['endsAt'],
    message: 'At most 90 days',
  });
export type FeaturedSlotCreateInput = z.output<typeof featuredSlotCreateSchema>;

/** `:id` of the per-slot moderator routes. */
export const featuredSlotIdParamSchema = z.object({ id: z.uuid() });

/** Where a slot stands at a given moment. */
export type FeaturedSlotState = 'active' | 'upcoming' | 'ended';

/** A slot in the moderator list. `id` names it in the API only; the UI never shows it. */
export interface FeaturedSlotDto {
  id: string;
  /** What a small cover and a link need (`authorName`, `mainTagSlug` for the default cover). */
  story: {
    publicId: string;
    slug: string;
    title: string;
    coverUrl: string | null;
    authorName: string;
    mainTagSlug: string;
  };
  startsAt: string;
  endsAt: string;
  state: FeaturedSlotState;
}

/** `GET /api/v1/moderation/featured`: running, upcoming, and ended in the last 30 days. */
export interface FeaturedSlotListDto {
  active: FeaturedSlotDto[];
  upcoming: FeaturedSlotDto[];
  ended: FeaturedSlotDto[];
}
