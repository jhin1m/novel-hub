/**
 * Content limits shared by the API (Zod) and the forms. Values are the starting points from the
 * spec; change them here only.
 */
export const LIMITS = {
  storyTitle: { min: 2, max: 150 },
  storySynopsisMax: 3_000,
  chapterTitleMax: 150,
  authorNoteMax: 1_000,
  chapterWords: { min: 300, max: 20_000 },
  /** Total tags per story, main tag included. */
  storyTagsMax: 10,
  cover: {
    maxBytes: 5 * 1024 * 1024,
    minWidth: 600,
    minHeight: 900,
    variants: [
      { width: 600, height: 900 },
      { width: 300, height: 450 },
    ],
  },
  avatar: { maxBytes: 2 * 1024 * 1024, size: 256 },
  revisionsKept: 20,
  /** Request body cap for saving a draft; about 20,000 words of JSON with plenty of headroom. */
  draftMaxBytes: 2_000_000,
} as const;

/** Image types accepted for upload (checked again from magic bytes on the server). */
export const COVER_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
