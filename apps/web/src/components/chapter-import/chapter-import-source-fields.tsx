import { m } from '@novel-hub/shared/messages';
import { useId, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FormMessage } from '../auth-ui';

/** Reads a `.txt` file as strict UTF-8; `null` when it is not valid UTF-8 text. */
async function readUtf8(file: File): Promise<string | null> {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
  } catch {
    return null;
  }
}

/** Where the import text comes from: typed or pasted, or read from a `.txt` file in the browser. */
export function ChapterImportSourceFields({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const [fileInvalid, setFileInvalid] = useState(false);
  const change = (next: string) => {
    setFileInvalid(false);
    onChange(next);
  };
  return (
    <>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-text`}>{m.chapter_import_text_label()}</Label>
        <Textarea
          id={`${id}-text`}
          value={value}
          onChange={(e) => change(e.target.value)}
          className="max-h-72 min-h-40"
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-file`}>{m.chapter_import_file_label()}</Label>
        <input
          id={`${id}-file`}
          type="file"
          accept=".txt,text/plain"
          className="text-sm file:mr-3 file:rounded-full file:border-0 file:bg-secondary file:px-4 file:py-2 file:font-semibold"
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Lets the same file be picked again after an edit.
            e.target.value = '';
            if (!file) return;
            void readUtf8(file).then((content) => {
              if (content === null) setFileInvalid(true);
              else change(content);
            });
          }}
        />
        {fileInvalid ? <FormMessage>{m.chapter_import_file_invalid()}</FormMessage> : null}
      </div>
    </>
  );
}
