import type { JobsOptions } from 'bullmq';

/**
 * Tuỳ chọn mặc định cho mọi job: thử 5 lần, backoff mũ từ 10s. Job xong giữ 1 giờ
 * (tối đa 1000 job), job lỗi giữ 7 ngày để điều tra; payload mail chứa URL có token nên
 * không giữ lâu hơn.
 */
export const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 10_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3_600 },
} as const satisfies JobsOptions;
