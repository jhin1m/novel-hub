/**
 * Paragraphs of the chapter text found by their `data-pid`. Compared one by one, never put into a
 * selector string, so a pid can never become CSS.
 */
export function findParagraph(root: HTMLElement | null, pid: string): HTMLElement | null {
  for (const element of root?.querySelectorAll<HTMLElement>('[data-pid]') ?? []) {
    if (element.dataset.pid === pid) return element;
  }
  return null;
}

export interface ParagraphText {
  pid: string;
  text: string;
}

/** Every paragraph and heading of the text with its words, in reading order. */
export function paragraphTexts(root: HTMLElement | null): ParagraphText[] {
  return [...(root?.querySelectorAll<HTMLElement>('[data-pid]') ?? [])].map((element) => ({
    pid: element.dataset.pid ?? '',
    text: element.textContent ?? '',
  }));
}
