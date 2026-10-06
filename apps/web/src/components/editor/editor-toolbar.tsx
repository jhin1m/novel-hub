import { m } from '@novel-hub/shared/messages';
import { type Editor, useEditorState } from '@tiptap/react';
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  type LucideIcon,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useKeyboardOffset } from '@/lib/use-keyboard-offset';

interface ToolbarAction {
  key: string;
  label: () => string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
  /** Toggle buttons expose their state through `aria-pressed`. */
  active?: (editor: Editor) => boolean;
  enabled?: (editor: Editor) => boolean;
}

const ACTIONS: ToolbarAction[][] = [
  [
    {
      key: 'bold',
      label: m.editor_bold,
      icon: Bold,
      run: (e) => e.chain().focus().toggleBold().run(),
      active: (e) => e.isActive('bold'),
    },
    {
      key: 'italic',
      label: m.editor_italic,
      icon: Italic,
      run: (e) => e.chain().focus().toggleItalic().run(),
      active: (e) => e.isActive('italic'),
    },
    {
      key: 'strike',
      label: m.editor_strike,
      icon: Strikethrough,
      run: (e) => e.chain().focus().toggleStrike().run(),
      active: (e) => e.isActive('strike'),
    },
  ],
  [
    {
      key: 'heading2',
      label: m.editor_heading_2,
      icon: Heading2,
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
      active: (e) => e.isActive('heading', { level: 2 }),
    },
    {
      key: 'heading3',
      label: m.editor_heading_3,
      icon: Heading3,
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
      active: (e) => e.isActive('heading', { level: 3 }),
    },
    {
      key: 'blockquote',
      label: m.editor_blockquote,
      icon: Quote,
      run: (e) => e.chain().focus().toggleBlockquote().run(),
      active: (e) => e.isActive('blockquote'),
    },
    {
      key: 'sceneBreak',
      label: m.editor_scene_break,
      icon: Minus,
      run: (e) => e.chain().focus().setHorizontalRule().run(),
    },
  ],
  [
    {
      key: 'undo',
      label: m.editor_undo,
      icon: Undo2,
      run: (e) => e.chain().focus().undo().run(),
      enabled: (e) => e.can().undo(),
    },
    {
      key: 'redo',
      label: m.editor_redo,
      icon: Redo2,
      run: (e) => e.chain().focus().redo().run(),
      enabled: (e) => e.can().redo(),
    },
  ],
];

/*
 * Phones: a bar fixed to the bottom, lifted above the on-screen keyboard; formatting scrolls
 * sideways while undo/redo stay pinned right. From `md` up: a floating pill under the header.
 */
const TOOLBAR_CLASS =
  'fixed inset-x-0 bottom-[var(--keyboard-offset,0px)] z-20 flex items-center border-t bg-card px-2 py-1.5 ' +
  'md:sticky md:inset-x-auto md:top-[76px] md:bottom-auto md:mx-auto md:mt-2 md:w-fit md:rounded-full md:border md:px-3';

export function EditorToolbar({ editor }: { editor: Editor }) {
  useKeyboardOffset();
  // One selector for every button; `useEditorState` compares results deeply, so the toolbar only
  // re-renders when a flag changes.
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      Object.fromEntries(
        ACTIONS.flat().map((a) => [
          a.key,
          { active: a.active?.(e) ?? false, enabled: a.enabled?.(e) ?? true },
        ]),
      ),
  });

  const renderGroup = (group: ToolbarAction[], g: number) => (
    <div key={g} className="flex shrink-0 items-center gap-0.5 border-r pr-1 last:border-r-0">
      {group.map((action) => {
        const flags = state[action.key];
        const Icon = action.icon;
        return (
          <Button
            key={action.key}
            type="button"
            variant="ghost"
            size="icon"
            aria-label={action.label()}
            title={action.label()}
            aria-pressed={action.active ? flags?.active : undefined}
            disabled={flags?.enabled === false}
            // Keep the editor selection: a mousedown on the button would blur it first.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => action.run(editor)}
            className="size-10 aria-pressed:bg-primary-soft aria-pressed:text-primary"
          >
            <Icon />
          </Button>
        );
      })}
    </div>
  );

  const formatting = ACTIONS.slice(0, -1);
  const history = ACTIONS.at(-1) ?? [];
  return (
    <div role="toolbar" aria-label={m.editor_toolbar_label()} className={TOOLBAR_CLASS}>
      <div className="flex min-w-0 grow items-center gap-1 overflow-x-auto border-r pr-1 md:overflow-visible">
        {formatting.map(renderGroup)}
      </div>
      <div className="flex shrink-0 items-center gap-0.5 pl-1">
        {renderGroup(history, ACTIONS.length - 1)}
      </div>
    </div>
  );
}
