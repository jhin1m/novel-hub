import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
const eslint = new ESLint({ cwd: repoRoot });

// The first lint builds the type-aware program for the whole repo: ~15 s alone, far longer while the
// rest of the suite runs in parallel.
const LINT_TIMEOUT_MS = 120_000;

/** Lints `code` as if it were the content of an existing web file; returns the restricted imports. */
async function restrictedImports(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: fileURLToPath(new URL(`./${file}`, import.meta.url)),
  });
  return (result?.messages ?? [])
    .filter((msg) => msg.ruleId === '@typescript-eslint/no-restricted-imports')
    .map((msg) => msg.message);
}

const IMPORT_CORE =
  "import { createStory } from '@novel-hub/core';\nexport const x = createStory;\n";
const IMPORT_TIPTAP = "import { useEditor } from '@tiptap/react';\nexport const y = useEditor;\n";
const IMPORT_EDITOR_SCHEMA =
  "import { editorSchema } from '@novel-hub/shared/editor';\nexport const z = editorSchema;\n";

describe('browser import boundaries', () => {
  it(
    'blocks server code and Tiptap outside the editor area',
    async () => {
      expect(await restrictedImports('routes/index.tsx', IMPORT_CORE)).toHaveLength(1);
      expect(await restrictedImports('routes/index.tsx', IMPORT_TIPTAP)).toHaveLength(1);
      expect(await restrictedImports('routes/index.tsx', IMPORT_EDITOR_SCHEMA)).toHaveLength(1);
    },
    LINT_TIMEOUT_MS,
  );

  it(
    'allows Tiptap in the editor area but still blocks server code there',
    async () => {
      const file = 'components/editor/chapter-editor.tsx';
      expect(await restrictedImports(file, IMPORT_TIPTAP)).toEqual([]);
      expect(await restrictedImports(file, IMPORT_EDITOR_SCHEMA)).toEqual([]);
      expect(await restrictedImports(file, IMPORT_CORE)).toHaveLength(1);
    },
    LINT_TIMEOUT_MS,
  );
});
