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
