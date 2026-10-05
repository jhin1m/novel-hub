import { CLIENT_IP_HEADER } from '@novel-hub/shared';
import { describe, expect, it } from 'vitest';
import { withClientIpHeader } from './client-ip-header';

describe('withClientIpHeader', () => {
  it('sets the header, keeps the others and hands the POST body over', async () => {
    const original = new Request('http://x/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', [CLIENT_IP_HEADER]: '198.51.100.1' },
      body: '{"email":"a@b.c"}',
    });
    const copy = withClientIpHeader(original, '203.0.113.9');
    expect(copy.method).toBe('POST');
    expect(copy.url).toBe('http://x/api/auth/sign-in/email');
    expect(copy.headers.get(CLIENT_IP_HEADER)).toBe('203.0.113.9');
    expect(copy.headers.get('content-type')).toBe('application/json');
    expect(await copy.text()).toBe('{"email":"a@b.c"}');
  });

  it('drops a client-sent header when the address is unknown', () => {
    const original = new Request('http://x/', { headers: { [CLIENT_IP_HEADER]: '198.51.100.1' } });
    const copy = withClientIpHeader(original, null);
    expect(copy.headers.has(CLIENT_IP_HEADER)).toBe(false);
    expect(copy.method).toBe('GET');
  });
});
