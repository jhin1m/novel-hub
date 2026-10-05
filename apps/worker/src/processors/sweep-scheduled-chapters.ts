import { type Db, publishDueChapters } from '@novel-hub/core';

/** Flips due scheduled chapters to published; the database decides what is due. */
export async function processSweepScheduledChapters(deps: { db: Db }): Promise<void> {
  const { published } = await publishDueChapters(deps.db);
  if (published > 0) console.info(`[publishing] published ${published} scheduled chapters`);
}
