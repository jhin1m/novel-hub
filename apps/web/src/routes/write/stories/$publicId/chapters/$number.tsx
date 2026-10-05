import { m } from '@novel-hub/shared/messages';
import { Link, createFileRoute } from '@tanstack/react-router';
import { FormMessage, textLinkClass } from '../../../../../components/auth-ui';
import { ChapterEditor } from '../../../../../components/editor/chapter-editor';
import { WriterGate } from '../../../../../components/writer-gate';
import { ApiError } from '../../../../../lib/api-errors';
import { useChapterDraft } from '../../../../../lib/chapters';

/** Positive integer as written in the URL; anything else is treated as a missing chapter. */
function parseChapterNumber(raw: string): number | null {
  return /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null;
}

export const Route = createFileRoute('/write/stories/$publicId/chapters/$number')({
  // The editor is browser-only (Tiptap needs the DOM) and personal; nothing to render on the server.
  ssr: false,
  head: () => ({
    meta: [{ title: m.editor_content_label() }, { name: 'robots', content: 'noindex' }],
  }),
  component: ChapterEditorPage,
});

function ChapterEditorPage() {
  const { publicId, number: rawNumber } = Route.useParams();
  const number = parseChapterNumber(rawNumber);
  return (
    <WriterGate>
      {number === null ? (
        <Missing publicId={publicId} />
      ) : (
        <LoadedEditor publicId={publicId} number={number} />
      )}
    </WriterGate>
  );
}

function LoadedEditor({ publicId, number }: { publicId: string; number: number }) {
  const draft = useChapterDraft(publicId, number);
  if (draft.isPending) {
    return <p className="px-4 py-10 text-center text-muted-foreground">{m.writer_loading()}</p>;
  }
  if (draft.isError) {
    const missing =
      draft.error instanceof ApiError && (draft.error.status === 404 || draft.error.status === 403);
    return missing ? (
      <Missing publicId={publicId} />
    ) : (
      <FormMessage>{m.error_generic()}</FormMessage>
    );
  }
  return (
    <ChapterEditor
      key={`${publicId}:${number}`}
      publicId={publicId}
      number={number}
      draft={draft.data}
    />
  );
}

function Missing({ publicId }: { publicId: string }) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-10">
      <FormMessage>{m.chapter_not_found()}</FormMessage>
      <Link to="/write/stories/$publicId" params={{ publicId }} className={textLinkClass}>
        {m.editor_back()}
      </Link>
    </div>
  );
}
