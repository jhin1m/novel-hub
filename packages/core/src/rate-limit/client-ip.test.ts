import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clientIp,
  createClientIpResolver,
  normalizeIp,
  untrustedCfIpWarning,
  warnUntrustedCfIpOnce,
} from './client-ip';

/** A request as srvx hands it over: the TCP peer on `ip`. */
function requestFrom(peer: unknown, headers: Record<string, string> = {}): Request {
  return Object.assign(new Request('http://x/', { headers }), { ip: peer });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizeIp', () => {
  it('keeps IPv4 as is', () => {
    expect(normalizeIp('203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp(' 203.0.113.9 ')).toBe('203.0.113.9');
  });

  it('turns IPv4-mapped IPv6 back into IPv4', () => {
    expect(normalizeIp('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp('::FFFF:127.0.0.1')).toBe('127.0.0.1');
  });

  it('cuts IPv6 to its /64, so one subscriber cannot rotate through it', () => {
    expect(normalizeIp('2001:db8:1:2:aaaa:bbbb:cccc:dddd')).toBe('2001:db8:1:2::');
    expect(normalizeIp('2001:db8:1:2::1')).toBe(normalizeIp('2001:db8:1:2:ffff::9'));
    expect(normalizeIp('2001:db8:1:2::1')).not.toBe(normalizeIp('2001:db8:1:3::1'));
    expect(normalizeIp('2001:DB8::1')).toBe('2001:db8:0:0::');
    expect(normalizeIp('::1')).toBe('0:0:0:0::');
    expect(normalizeIp('fe80::1%eth0')).toBe('fe80:0:0:0::');
  });

  it('rejects anything that is not an address', () => {
    for (const junk of ['', 'unknown', '1.2.3', '999.1.1.1', '1.2.3.4, 5.6.7.8', '2001:db8:::1']) {
      expect(normalizeIp(junk)).toBeNull();
    }
  });
});

describe('clientIp', () => {
  it('without Cloudflare trust uses the peer and ignores every forwarding header', () => {
    const request = requestFrom('::ffff:198.51.100.7', {
      'cf-connecting-ip': '1.1.1.1',
      'x-forwarded-for': '2.2.2.2',
    });
    expect(clientIp(request, { trustCf: false })).toBe('198.51.100.7');
  });

  it('with Cloudflare trust uses CF-Connecting-IP', () => {
    const request = requestFrom('172.64.0.1', { 'cf-connecting-ip': '203.0.113.5' });
    expect(clientIp(request, { trustCf: true })).toBe('203.0.113.5');
  });

  it('falls back to the peer when CF-Connecting-IP is missing or not one address', () => {
    expect(clientIp(requestFrom('172.64.0.1'), { trustCf: true })).toBe('172.64.0.1');
    const listed = requestFrom('172.64.0.1', { 'cf-connecting-ip': '1.1.1.1, 2.2.2.2' });
    expect(clientIp(listed, { trustCf: true })).toBe('172.64.0.1');
  });

  it('is null when the runtime gives no usable address', () => {
    expect(clientIp(new Request('http://x/'), { trustCf: false })).toBeNull();
    expect(clientIp(requestFrom(''), { trustCf: false })).toBeNull();
    expect(clientIp(requestFrom(42), { trustCf: false })).toBeNull();
  });
});

describe('createClientIpResolver', () => {
  it('logs the source once and never the address', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const resolve = createClientIpResolver({ trustCf: false });
    expect(resolve(requestFrom('198.51.100.7'))).toBe('198.51.100.7');
    resolve(requestFrom('198.51.100.8'));
    expect(info).toHaveBeenCalledTimes(1);
    expect(info).toHaveBeenCalledWith('[rate-limit] client IP source: peer');
  });

  it('warns when no address is available', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createClientIpResolver({ trustCf: false })(new Request('http://x/'));
    expect(warn).toHaveBeenCalledWith('[rate-limit] client IP source: none');
  });
});

describe('untrustedCfIpWarning', () => {
  it('warns in production when CF-Connecting-IP is not trusted', () => {
    const warning = untrustedCfIpWarning({ NODE_ENV: 'production', TRUST_CF_IP: false });
    expect(warning).toMatch(/TRUST_CF_IP=false/);
    expect(warning).toMatch(/Cloudflare/);
  });

  it('stays quiet when trusted or outside production', () => {
    expect(untrustedCfIpWarning({ NODE_ENV: 'production', TRUST_CF_IP: true })).toBeNull();
    expect(untrustedCfIpWarning({ NODE_ENV: 'development', TRUST_CF_IP: false })).toBeNull();
    expect(untrustedCfIpWarning({ NODE_ENV: 'test', TRUST_CF_IP: false })).toBeNull();
  });
});

describe('warnUntrustedCfIpOnce', () => {
  it('warns once per state, and never when there is nothing to warn about', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = {};
    warnUntrustedCfIpOnce({ NODE_ENV: 'production', TRUST_CF_IP: false }, state);
    warnUntrustedCfIpOnce({ NODE_ENV: 'production', TRUST_CF_IP: false }, state);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/TRUST_CF_IP=false/);

    warnUntrustedCfIpOnce({ NODE_ENV: 'production', TRUST_CF_IP: true }, {});
    warnUntrustedCfIpOnce({ NODE_ENV: 'development', TRUST_CF_IP: false }, {});
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
