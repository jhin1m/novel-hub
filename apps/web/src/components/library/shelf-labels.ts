import type { Shelf } from '@novel-hub/shared';
import { m } from '@novel-hub/shared/messages';

/** Display name of each shelf, in the order of `SHELVES`. */
export const SHELF_LABELS: Record<Shelf, () => string> = {
  reading: m.shelf_reading,
  plan: m.shelf_plan,
  done: m.shelf_done,
  dropped: m.shelf_dropped,
};
