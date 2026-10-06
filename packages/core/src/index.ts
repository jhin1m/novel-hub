export {
  type CheckHealthDeps,
  type CheckStatus,
  type HealthChecks,
  type HealthReport,
  checkHealth,
  pingPostgres,
} from './health/check-health';
export {
  createHealthRedis,
  createProducerConnection,
  createWorkerConnection,
  logRedisErrors,
  pingRedis,
} from './infra/redis';
export { TimeoutError, withTimeout } from './lib/with-timeout';
export { type BuiltEmail, buildAuthEmail } from './mail/auth-emails';
export {
  type MailMessage,
  type Mailer,
  type MailerConfig,
  createMailer,
  mailerConfigFromEnv,
} from './mail/mailer';
export type { AuthEmailKind, AuthMailMessage, AuthMailPort } from './mail/ports';
export { DEFAULT_JOB_OPTIONS } from './queue/job-options';
export { type MailQueue, createMailQueue, enqueueAuthEmail } from './queue/producer';
export {
  type PolicyUser,
  type UserRole,
  type UserStatus,
  hasAnyRole,
  isBanned,
  isEmailVerified,
} from './policies/user';
export type { CurrentUser } from './users/current-user';
export { markEmailVerified } from './users/mark-email-verified';
export { revokeUnprovenAccess } from './users/revoke-unproven-access';
export { generateUsername, isUsernameTaken } from './users/username';
export type { Db } from '@novel-hub/db';
export {
  COVER_MAX_PIXELS,
  type CoverImageError,
  type CoverVariants,
  processCoverImage,
} from './images/cover';
export { type Result, err, ok } from './lib/result';
export { SemaphoreFullError, createSemaphore } from './lib/semaphore';
export { type StoryActor, canEditChapter, canEditStory } from './policies/story';
export { type S3Config, createS3Storage, s3ConfigFromEnv } from './storage/s3-storage';
export type { StoragePort } from './storage/storage';
export { type CoverDeps, removeStoryCover, setStoryCover } from './stories/cover';
export { createStory } from './stories/create-story';
export { type OwnedStoryError, loadOwnedStory } from './stories/load-owned-story';
export { getAuthorStory, listAuthorStories, listTags } from './stories/read-stories';
export { type ResolvedTags, type TagError, resolveTags } from './stories/resolve-tags';
export { type AuthorStoryView, type TagView } from './stories/story-view';
export { type UpdatedStory, updateStory } from './stories/update-story';
export { updateChapterMeta } from './chapters/chapter-meta';
export { type AuthorChapterView, type ChapterRow } from './chapters/chapter-view';
export { createChapter } from './chapters/create-chapter';
export { type DraftView, type SaveDraftError, getDraft, saveDraft } from './chapters/drafts';
export { listAuthorChapters } from './chapters/list-chapters';
export { loadOwnedChapter } from './chapters/load-owned-chapter';
export {
  type ContentChange,
  type ContentJob,
  contentChangeSchema,
  jobsForChange,
} from './content/hooks';
export {
  type ContentQueue,
  type DrainContentEventsDeps,
  type DrainResult,
  createContentQueue,
  drainContentEvents,
  recordContentChanges,
} from './content/outbox';
export { CHAPTER_SANITIZE, sanitizeChapterHtml } from './content/sanitize';
export { normalizePids } from './content/normalize-pids';
export {
  type PublishedContent,
  hashContent,
  renderChapterHtml,
  renderPublishedContent,
} from './content/render';
export { recomputeStoryCounters } from './publishing/counters';
export { deleteChapter } from './publishing/delete-chapter';
export {
  type PublishError,
  type PublishResult,
  publishChapter,
} from './publishing/publish-chapter';
export { publishDueChapters } from './publishing/publish-due';
export {
  type ScheduleError,
  scheduleChapter,
  unscheduleChapter,
  validateScheduleTime,
} from './publishing/schedule-chapter';
export {
  type RestoredDraft,
  type RevisionPreview,
  type RevisionSummary,
  getRevisionPreview,
  listRevisions,
  restoreRevision,
  revisionKey,
} from './revisions/revisions';
export {
  type ReadDecision,
  type ReadableChapterFacts,
  canReadChapter,
  isStoryPubliclyVisible,
} from './access/can-read-chapter';
export {
  type ChapterPageData,
  getChapterForReading,
  listReadableChapters,
} from './reader/get-chapter-for-reading';
export { getChapterToc } from './reader/toc';
export { type PreferencesError, getPreferences, updatePreferences } from './users/preferences';
export { type ReadableChapterRef, findReadableChapterRef } from './reader/readable-chapter-ref';
export { saveReadingProgress } from './reading/progress';
export {
  type CdnConfig,
  type CdnPurger,
  PURGE_CHUNK_SIZE,
  cdnConfigFromEnv,
  createCdnPurger,
} from './cdn/purge';
export { storyUrlsByPublicId, storyUrlsEverPublished, urlsFor } from './cdn/urls-for';
export { type ViewCounter, type ViewRecord, createViewCounter } from './views/view-counter';
export { type RecordChapterViewDeps, recordChapterView } from './views/record-chapter-view';
export { flushViewCounters } from './views/flush';
export {
  type ListOptions,
  type Paged,
  type StoryCardDto,
  type StoryCardRow,
  publicStoryWhere,
  selectStoryCards,
  storyCardColumns,
  toStoryCard,
} from './catalog/story-card';
export { chaptersPerWeek } from './catalog/frequency';
export { type StoryPageData, getStoryPage } from './catalog/story-page';
export { type AuthorPageData, getAuthorPage } from './catalog/author-page';
export { type TagPageResult, canonicalTagSlug, getTagPage } from './catalog/tag-page';
export {
  type HomePageData,
  getHomePage,
  listGenres,
  listNotable,
  listRecentlyUpdated,
} from './catalog/home';
export { catalogUrls } from './catalog/urls';
export { type StoryList, listStories } from './catalog/lists';
export {
  SEARCH_REQUEST_TIMEOUT_MS,
  type SearchCtx,
  type SearchIndexNames,
  createSearchCtx,
  searchIndexNames,
} from './search/client';
export {
  AUTHOR_INDEX_SETTINGS,
  STORY_INDEX_SETTINGS,
  ensureSearchSettings,
} from './search/settings';
export {
  type AuthorDoc,
  type StoryDoc,
  loadAuthorDocs,
  loadStoryDocs,
  storyDocToCard,
} from './search/documents';
export {
  type SyncOutcome,
  syncAuthor,
  syncStory,
  syncStoryAndAuthor,
  syncUserContent,
} from './search/sync';
export { type AuthorHit, type SearchResult, buildStoryFilter, searchCatalog } from './search/query';
export { type ReindexResult, reindexAll } from './search/reindex';
export {
  type LibraryItemDto,
  getShelf,
  listLibrary,
  removeFromLibrary,
  setShelf,
} from './library/library';
export { type ContinueDto, getContinueReading } from './reading/continue';
export {
  type HistoryItemDto,
  type HistoryPage,
  listHistory,
  removeFromHistory,
} from './reading/history';
export {
  type ClientIpOptions,
  type ClientIpSource,
  clientIp,
  createClientIpResolver,
  normalizeIp,
  resolveClientIp,
  warnUntrustedCfIpOnce,
} from './rate-limit/client-ip';
export {
  type CreateRateLimiterOptions,
  type RateLimitDecision,
  type RateLimitSubject,
  type RateLimiter,
  createRateLimiter,
} from './rate-limit/limiter';
export { resetRateLimits } from './rate-limit/reset';
export {
  DUPLICATE_REASON,
  type FingerprintResult,
  fingerprintChapter,
} from './dedupe/fingerprint-chapter';
export { listChaptersNeedingFingerprint } from './dedupe/backfill';
export { normalizeForDedupe, shingles } from './dedupe/normalize';
export { jaccardEstimate, minhash } from './dedupe/minhash';
export { hamming64, simhash } from './dedupe/simhash';
export { lshKeys } from './dedupe/lsh';
export { canModerate, canModerateUser } from './policies/moderation';
export { canPostCommunityContent } from './policies/community';
export { type CommentDto, type CommentThreadDto, type CommentViewer } from './comments/comment-dto';
export { type ChapterCommentsPage, listChapterComments } from './comments/list-comments';
export { type CommentRepliesPage, listCommentReplies } from './comments/list-replies';
export { type CreateCommentError, createComment } from './comments/create-comment';
export { deleteComment } from './comments/delete-comment';
export { countParagraphComments } from './comments/paragraph-counts';
export { setCommentHidden } from './moderation/comment-visibility';
export { type ResolvedTarget, createReport } from './reports/create-report';
export {
  type ReportDto,
  type ReportListPage,
  type ReportTargetDto,
  listReports,
} from './reports/list-reports';
export {
  type ChapterContext,
  type CommentContext,
  type StoryContext,
  type UserContext,
} from './reports/report-context';
export { applyModerationAction } from './moderation/apply-action';
export { type ModerationError, type ModerationTarget } from './moderation/log-action';
export { banUser, moderateUser, unbanUser } from './moderation/user-status';
export { mergeTag } from './moderation/merge-tag';
export {
  SITEMAP_PAGE_SIZE,
  type SitemapPaging,
  countSitemap,
  listSitemapChapters,
  listSitemapPages,
  listSitemapStories,
} from './seo/sitemap';
export { type SitemapEntry, renderRobots, renderSitemapIndex, renderUrlset } from './seo/xml';
