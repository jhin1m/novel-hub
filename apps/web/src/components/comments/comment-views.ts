import type { CommentThreadDto } from '@novel-hub/core';

/** What the comment box shows for the account: nothing yet, a prompt, or the form. */
export type ComposerView = 'pending' | 'guest' | 'muted' | 'unverified' | 'form';

/**
 * The comment box by account: guests are asked to sign in, a muted account and an unverified email
 * get a notice; only an account allowed to post (the rule of `canPostCommunityContent`, checked
 * again on the server) gets the form. `pending` while the session is still loading.
 */
export function composerView(
  pending: boolean,
  me: { status: string; emailVerified: boolean } | null | undefined,
): ComposerView {
  if (pending) return 'pending';
  if (!me) return 'guest';
  if (me.status === 'muted') return 'muted';
  if (!me.emailVerified) return 'unverified';
  return 'form';
}

interface ThreadsPage {
  total: number | null;
  pinned: CommentThreadDto[];
  items: CommentThreadDto[];
  viewerCanPin: boolean;
}

/**
 * The threads of the pages loaded so far as listed (the pinned ones of the first page on top), the
 * total and whether the viewer may pin, all from the first page.
 */
export function feedThreads(pages: readonly ThreadsPage[]): {
  threads: CommentThreadDto[];
  total: number | null;
  canPin: boolean;
} {
  const first = pages[0];
  // A thread unpinned elsewhere while paging may come back in a later page: listed once.
  const seen = new Set<string>();
  const threads = [...(first?.pinned ?? []), ...pages.flatMap((page) => page.items)].filter(
    (thread) => !seen.has(thread.id) && seen.add(thread.id),
  );
  return {
    threads,
    total: first?.total ?? null,
    canPin: first?.viewerCanPin ?? false,
  };
}
