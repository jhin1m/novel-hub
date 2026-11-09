import { m } from '@novel-hub/shared/messages';
import { formatDecimal } from '@/lib/format';
import type { ImportRow } from '@/lib/chapter-import/chapter-import-rows';

/**
 * The chapters as they will be created: the number each will get, its name and word count. When
 * the import publishes or schedules, a chapter outside the word range is marked and named below.
 */
export function ChapterImportPreview({
  rows,
  firstNumber,
  checkWords,
}: {
  rows: readonly ImportRow[];
  firstNumber: number;
  checkWords: boolean;
}) {
  const outOfRange = checkWords && rows.some((row) => !row.wordsInRange);
  return (
    <section aria-labelledby="chapter-import-preview" className="flex flex-col gap-2">
      <h3 id="chapter-import-preview" className="text-sm font-bold">
        {m.chapter_import_preview()}{' '}
        <span className="font-normal text-muted-foreground">
          {m.chapter_import_preview_count({ count: rows.length })}
        </span>
      </h3>
      <div className="max-h-64 overflow-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 font-semibold">
                {m.chapter_import_col_number()}
              </th>
              <th scope="col" className="px-3 py-2 font-semibold">
                {m.chapter_import_col_title()}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                {m.chapter_import_col_words()}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const flagged = checkWords && !row.wordsInRange;
              return (
                <tr key={i} className="border-t" aria-invalid={flagged || undefined}>
                  <td className="px-3 py-2 tabular-nums">{firstNumber + i}</td>
                  <td className="px-3 py-2 break-words">{row.title}</td>
                  <td
                    className={
                      flagged
                        ? 'px-3 py-2 text-right font-semibold text-destructive tabular-nums'
                        : 'px-3 py-2 text-right tabular-nums'
                    }
                  >
                    {formatDecimal(row.words)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {outOfRange ? (
        <p role="alert" className="text-sm text-destructive">
          {m.error_word_count_out_of_range()}
        </p>
      ) : null}
    </section>
  );
}
