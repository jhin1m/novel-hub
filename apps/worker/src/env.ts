import {
  appEnvSchema,
  dbEnvSchema,
  queueEnvSchema,
  redisEnvSchema,
  requireSmtpInProduction,
  smtpEnvSchema,
} from '@novel-hub/shared/env';

/**
 * Env of the worker: database (scheduled publishing, outbox), Redis and SMTP; none of the web's
 * auth variables. Production requires SMTP.
 */
export const workerEnvSchema = requireSmtpInProduction(
  appEnvSchema
    .extend(dbEnvSchema.shape)
    .extend(redisEnvSchema.shape)
    .extend(queueEnvSchema.shape)
    .extend(smtpEnvSchema.shape),
);
