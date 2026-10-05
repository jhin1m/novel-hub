import { z } from 'zod';
import { chapterNumberParamSchema, draftSaveSchema } from './chapter';

/**
 * A revision is addressed by its creation time in epoch milliseconds, so internal ids never leave
 * the server and the key stays stable when newer revisions are added.
 */
export const revisionKeySchema = z.string().regex(/^\d{1,15}$/);

/** `/stories/:publicId/chapters/:number/revisions/:key` */
export const revisionParamSchema = chapterNumberParamSchema.extend({ key: revisionKeySchema });

/** Restoring writes the draft, so it pins the draft version exactly like an autosave does. */
export const restoreRevisionSchema = draftSaveSchema.pick({ baseUpdatedAt: true });

export type RestoreRevisionInput = z.output<typeof restoreRevisionSchema>;
