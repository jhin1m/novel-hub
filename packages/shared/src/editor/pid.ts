import { generatePublicId } from '../public-id';

/** Paragraph ids (`data-pid`): 8 characters, same alphabet as public ids. */
export const PID_PATTERN = /^[a-z2-9]{8}$/;

/** Random paragraph id; uniqueness inside a chapter is enforced by the editor and on publish. */
export function generatePid(): string {
  return generatePublicId();
}

export function isValidPid(value: unknown): value is string {
  return typeof value === 'string' && PID_PATTERN.test(value);
}
