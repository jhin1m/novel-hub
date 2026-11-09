import { m } from '@novel-hub/shared/messages';
import { ApiError, apiErrorMessage } from '@/lib/api-errors';
import type { ImportChaptersResult } from '@/lib/chapter-import/use-import-chapters';
import { FormMessage } from '../auth-ui';

/**
 * How the last import went: refused as a whole (`error`), done, or stopped while publishing at a
 * chapter, which is named by its real number with the reason; earlier chapters went out and the
 * rest stay drafts.
 */
export function ChapterImportOutcome({
  error,
  result,
}: {
  error: Error | null;
  result: ImportChaptersResult | undefined;
}) {
  if (error) {
    return (
      <FormMessage>
        {/* The body limit answers before the API, without an error code. */}
        {error instanceof ApiError && error.status === 413
          ? m.chapter_import_too_large()
          : apiErrorMessage(error)}
      </FormMessage>
    );
  }
  if (!result) return null;
  return (
    <div role="status" className="flex flex-col gap-1 text-sm">
      {result.failedAt === undefined ? (
        <p>{m.chapter_import_done({ count: result.created })}</p>
      ) : (
        <>
          <p>
            {m.chapter_import_partial({
              count: result.created,
              index: result.firstNumber + result.failedAt - 1,
            })}
          </p>
          <p className="text-destructive">{apiErrorMessage(new ApiError(0, result.code))}</p>
        </>
      )}
    </div>
  );
}
