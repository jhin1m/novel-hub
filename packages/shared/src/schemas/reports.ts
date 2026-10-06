import { z } from 'zod';
import { LIMITS } from '../limits';
import { isValidPublicId } from '../public-id';
import { usernameParamSchema } from './catalog';
import { tagSlugSchema } from './story';

/** Reasons a reader can pick when reporting (spec section 7). */
export const USER_REPORT_REASONS = [
  'copyright',
  'plagiarism',
  'spam',
  'prohibited',
  'mislabeled',
] as const;
/** Every `reports.reason`: the reader reasons plus the automatic duplicate check. */
export const REPORT_REASONS = [...USER_REPORT_REASONS, 'duplicate'] as const;
export type UserReportReason = (typeof USER_REPORT_REASONS)[number];
export type ReportReason = (typeof REPORT_REASONS)[number];

export const REPORT_STATUSES = ['open', 'resolved', 'dismissed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** `reports.target_type` values. */
export const REPORT_TARGET_TYPES = ['story', 'chapter', 'user', 'comment'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/** One-click moderator actions (spec section 7): the bodies of `POST /moderation/actions`. */
export const MODERATION_ACTIONS = [
  'hide_story',
  'restore_story',
  'hide_chapter',
  'restore_chapter',
  'hide_comment',
  'restore_comment',
  'mute_user',
  'unmute_user',
  'ban_user',
  'unban_user',
  'merge_tag',
  'dismiss_report',
  'resolve_report',
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

/**
 * Every `moderation_actions.action` value: the one-click actions plus moderator work that is logged
 * but not taken from the queue. Only the one-click ones are accepted as a request body.
 */
export const MODERATION_LOG_ACTIONS = [...MODERATION_ACTIONS] as const;
export type ModerationLogAction = (typeof MODERATION_LOG_ACTIONS)[number];

/** Reports per page of the moderation queue. */
export const REPORTS_PAGE_SIZE = 20;

const storyPublicId = z.string().refine(isValidPublicId);
const chapterNumber = z.number().int().positive().max(2_147_483_647);

/**
 * What a report points at, by public keys. A comment has no public key, so it is named by its id:
 * the one deliberate exception, and the UI never shows that id.
 */
export const reportTargetSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('story'), storyPublicId }),
  z.object({ type: z.literal('chapter'), storyPublicId, number: chapterNumber }),
  z.object({ type: z.literal('user'), username: usernameParamSchema }),
  z.object({ type: z.literal('comment'), commentId: z.uuid() }),
]);
export type ReportTarget = z.infer<typeof reportTargetSchema>;

/** Body of `POST /api/v1/reports`. An empty description is stored as no description. */
export const reportCreateSchema = z.object({
  target: reportTargetSchema,
  reason: z.enum(USER_REPORT_REASONS),
  detail: z.string().trim().max(LIMITS.reportDetailMax).optional(),
});
export type ReportCreateInput = z.output<typeof reportCreateSchema>;

/** Query of `GET /api/v1/moderation/reports`. Bad values fall back instead of failing. */
export const reportListQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).catch('open'),
  reason: z.enum(REPORT_REASONS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).catch(1),
});
export type ReportListQuery = z.output<typeof reportListQuerySchema>;

/**
 * Optional on every action: a note for the log (empty = none), and the report the moderator acted
 * from.
 */
const actionCommon = {
  note: z.string().trim().max(LIMITS.modNoteMax).optional(),
  reportId: z.uuid().optional(),
};

const storyAction = <A extends string>(action: A) =>
  z.object({ action: z.literal(action), storyPublicId, ...actionCommon });
const chapterAction = <A extends string>(action: A) =>
  z.object({ action: z.literal(action), storyPublicId, number: chapterNumber, ...actionCommon });
const commentAction = <A extends string>(action: A) =>
  z.object({ action: z.literal(action), commentId: z.uuid(), ...actionCommon });
const userAction = <A extends string>(action: A) =>
  z.object({ action: z.literal(action), username: usernameParamSchema, ...actionCommon });
const reportAction = <A extends string>(action: A) =>
  z.object({ action: z.literal(action), reportId: z.uuid(), note: actionCommon.note });

/** Body of `POST /api/v1/moderation/actions`, one shape per action. */
export const moderationActionSchema = z.discriminatedUnion('action', [
  storyAction('hide_story'),
  storyAction('restore_story'),
  chapterAction('hide_chapter'),
  chapterAction('restore_chapter'),
  commentAction('hide_comment'),
  commentAction('restore_comment'),
  userAction('mute_user'),
  userAction('unmute_user'),
  userAction('ban_user'),
  userAction('unban_user'),
  z.object({
    action: z.literal('merge_tag'),
    sourceSlug: tagSlugSchema,
    targetSlug: tagSlugSchema,
    ...actionCommon,
  }),
  reportAction('dismiss_report'),
  reportAction('resolve_report'),
]);
export type ModerationActionInput = z.output<typeof moderationActionSchema>;
