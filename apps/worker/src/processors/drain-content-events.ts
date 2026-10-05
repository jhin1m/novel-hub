import { type ContentQueue, type Db, drainContentEvents } from '@novel-hub/core';

export interface DrainContentEventsJobDeps {
  db: Db;
  contentQueue: Pick<ContentQueue, 'addBulk'>;
}

/**
 * Moves outbox events into the `content` queue. A refused batch is not an error here: the events
 * stay pending and the next tick (5 seconds later) retries them.
 */
export async function processDrainContentEvents(deps: DrainContentEventsJobDeps): Promise<void> {
  await drainContentEvents(deps);
}
