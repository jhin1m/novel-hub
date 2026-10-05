// Server-side only. Browsers import `@novel-hub/api/client`.
export { type App, type AppType, createApp } from './app';
export type { ApiDeps, AuthPort } from './deps';
export { type CoreErrorCode, coreError } from './lib/core-errors';
export { type ErrorBody, errorBody } from './lib/errors';
export { validate } from './lib/validate';
export {
  type AuthedEnv,
  requireAuth,
  requireRole,
  requireVerifiedEmail,
} from './middleware/require-auth';
export { type SessionEnv, sessionMiddleware } from './middleware/session';
