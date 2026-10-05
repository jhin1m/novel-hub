import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCdnPurger } from './purge';

const config = { zoneId: '0123456789abcdef0123456789abcdef', apiToken: 'token' };
const urls = (n: number) => Array.from({ length: n }, (_, i) => `https://example.com/p/${i}`);
const okResponse = () => Response.json({ success: true, errors: [] });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createCdnPurger', () => {
  it('sends 100 URLs per request with the zone and token', async () => {
    const fetchFn = vi.fn<typeof fetch>(() => Promise.resolve(okResponse()));
    await createCdnPurger(config, fetchFn).purge(urls(250));
    expect(fetchFn).toHaveBeenCalledTimes(3);
    const [url, init] = fetchFn.mock.calls[0] ?? [];
    expect(url).toBe(
      'https://api.cloudflare.com/client/v4/zones/0123456789abcdef0123456789abcdef/purge_cache',
    );
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer token');
    const sizes = fetchFn.mock.calls.map(
      ([, i]) => (JSON.parse(i?.body as string) as { files: string[] }).files.length,
    );
    expect(sizes).toEqual([100, 100, 50]);
  });

  it('does nothing for an empty list', async () => {
    const fetchFn = vi.fn<typeof fetch>();
    await createCdnPurger(config, fetchFn).purge([]);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('never fetches without a config', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchFn = vi.fn<typeof fetch>();
    const purger = createCdnPurger(null, fetchFn);
    await purger.purge(urls(3));
    await purger.purge(urls(3));
    expect(fetchFn).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledTimes(1);
  });

  it('throws on an HTTP error or `success: false`', async () => {
    const http500 = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response('oops', { status: 500 })),
    );
    await expect(createCdnPurger(config, http500).purge(urls(1))).rejects.toThrow(/HTTP 500/);
    const refused = vi.fn<typeof fetch>(() =>
      Promise.resolve(Response.json({ success: false, errors: [{ code: 1 }] })),
    );
    await expect(createCdnPurger(config, refused).purge(urls(1))).rejects.toThrow(/HTTP 200/);
  });

  it('bounds every request with a 10 second abort signal', async () => {
    // `AbortSignal.timeout` runs on Node's own timers, which fake timers do not drive, so the
    // test checks the signal it hands to fetch and that an abort rejects the purge.
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockReturnValue(controller.signal);
    const fetchFn = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const pending = createCdnPurger(config, fetchFn).purge(urls(1));
    expect(timeout).toHaveBeenCalledWith(10_000);
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
  });
});
