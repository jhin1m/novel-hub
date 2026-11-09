// Public exports of the moderation domain; re-exported by `src/index.ts`.
export { type FeatureSuggestionsDto, listFeatureSuggestions } from './feature-suggestions';
export { WARNING_RULES, type WarningSummary, countRecentWarnings } from './recent-warnings';
// The moderation queue's context of an author announcement (the reports barrel is not this domain's).
export type { AnnouncementContext } from '../reports/announcement-report-context';
