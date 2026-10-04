import {
  appEnvSchema,
  queueEnvSchema,
  redisEnvSchema,
  requireSmtpInProduction,
  smtpEnvSchema,
} from '@novel-hub/shared/env';

/** Env của worker: không đòi biến DB hay auth của web. Production bắt buộc có SMTP. */
export const workerEnvSchema = requireSmtpInProduction(
  appEnvSchema
    .extend(redisEnvSchema.shape)
    .extend(queueEnvSchema.shape)
    .extend(smtpEnvSchema.shape),
);
