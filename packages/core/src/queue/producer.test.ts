import type { SendAuthEmailPayload } from '@novel-hub/shared';
import { describe, expect, it, vi } from 'vitest';
import { enqueueAuthEmail } from './producer';

const payload: SendAuthEmailPayload = {
  kind: 'verify',
  to: 'an@example.com',
  displayName: 'An',
  url: 'http://localhost:3000/api/auth/verify-email?token=abc',
};

describe('enqueueAuthEmail', () => {
  it('payload hợp lệ → add job send-auth-email với payload đã parse', async () => {
    const add = vi.fn().mockResolvedValue({});
    await enqueueAuthEmail({ add }, payload);
    expect(add).toHaveBeenCalledWith('send-auth-email', payload);
  });

  it('payload sai → throw trước khi add', async () => {
    const add = vi.fn();
    await expect(
      enqueueAuthEmail({ add }, { ...payload, to: 'khong-phai-email' }),
    ).rejects.toThrow();
    expect(add).not.toHaveBeenCalled();
  });
});
