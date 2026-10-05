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

export function EditorToolbar({ editor }: { editor: Editor }) {
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

  return (
    <div
      role="toolbar"
      aria-label={m.editor_toolbar_label()}
      className="flex flex-wrap items-center gap-1"
    >
      {ACTIONS.map((group, g) => (
        <div key={g} className="flex items-center gap-0.5 border-r pr-1 last:border-r-0">
          {group.map((action) => {
            const flags = state[action.key];
            const Icon = action.icon;
            return (
              <Button
                key={action.key}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={action.label()}
                title={action.label()}
                aria-pressed={action.active ? flags?.active : undefined}
                disabled={flags?.enabled === false}
                // Keep the editor selection: a mousedown on the button would blur it first.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => action.run(editor)}
                className="aria-pressed:bg-accent aria-pressed:text-accent-foreground"
              >
                <Icon />
              </Button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
