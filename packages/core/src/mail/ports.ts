import type { SendAuthEmailPayload } from '@novel-hub/shared';

export type AuthEmailKind = SendAuthEmailPayload['kind'];

/** Cùng hình dạng với payload của job `send-auth-email`. */
export type AuthMailMessage = SendAuthEmailPayload;

/**
 * Cổng gửi mail auth: web đẩy job vào hàng đợi `mail`, worker gửi thật.
 * Better Auth gọi qua lớp bọc fire-and-forget nên cổng có chậm cũng không chặn request.
 */
export type AuthMailPort = (msg: AuthMailMessage) => Promise<void>;
