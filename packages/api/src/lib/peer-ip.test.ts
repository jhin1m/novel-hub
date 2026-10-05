import { describe, expect, it } from 'vitest';
import { peerIp } from './peer-ip';

describe('peerIp', () => {
  it('reads the ip srvx puts on the request', () => {
    const request = Object.assign(new Request('http://x/'), { ip: '203.0.113.9' });
    expect(peerIp(request)).toBe('203.0.113.9');
  });

  it('is null when the runtime gives no usable ip', () => {
    expect(peerIp(new Request('http://x/'))).toBeNull();
    expect(peerIp(Object.assign(new Request('http://x/'), { ip: '' }))).toBeNull();
    expect(peerIp(Object.assign(new Request('http://x/'), { ip: 42 }))).toBeNull();
  });
});
