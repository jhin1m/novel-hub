import { MAIL_JOBS } from '@novel-hub/shared';
import { type Job, UnrecoverableError } from 'bullmq';
import { type SendAuthEmailDeps, processSendAuthEmail } from './processors/send-auth-email';

export type JobDeps = SendAuthEmailDeps;

/** Chọn processor theo tên job; tên lạ thì không thử lại. */
export async function routeJob(job: Pick<Job, 'name' | 'data'>, deps: JobDeps): Promise<void> {
  switch (job.name) {
    case MAIL_JOBS.sendAuthEmail:
      return processSendAuthEmail(job.data, deps);
    default:
      throw new UnrecoverableError(`không có processor cho job "${job.name}"`);
  }
}
