/**
 * `@novel-hub/shared/editor`: everything that loads Tiptap. Kept off the main entry so pages that
 * only render chapters (and the reading page bundle) never pull Tiptap in.
 */
export {
  HEADING_LEVELS,
  PID_NODE_TYPES,
  type ParsedEditorDoc,
  editorExtensions,
  editorSchema,
  emptyDraftDoc,
  parseEditorDoc,
} from './extensions';
export {
  type EditorDocJson,
  type EditorMarkJson,
  type EditorNodeJson,
  docToText,
} from './doc-json';
export { PID_PATTERN, generatePid, isValidPid } from './pid';
