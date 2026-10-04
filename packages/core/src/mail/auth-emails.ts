import { m } from '@novel-hub/shared/messages';
import type { AuthEmailKind } from './ports';

export interface BuiltEmail {
  subject: string;
  text: string;
}

/** Tiêu đề và nội dung (text thuần) của mail xác thực / đặt lại mật khẩu. */
export function buildAuthEmail(input: {
  kind: AuthEmailKind;
  displayName: string;
  url: string;
}): BuiltEmail {
  const params = { name: input.displayName, url: input.url };
  return input.kind === 'verify'
    ? { subject: m.email_verify_subject(), text: m.email_verify_body(params) }
    : { subject: m.email_reset_subject(), text: m.email_reset_body(params) };
}
