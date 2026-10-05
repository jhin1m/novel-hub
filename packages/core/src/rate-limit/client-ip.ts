import { isIP } from 'node:net';

export interface ClientIpOptions {
  /** Take `CF-Connecting-IP`; only safe when the origin accepts nothing but Cloudflare. */
  trustCf: boolean;
}

export type ClientIpSource = 'cf-connecting-ip' | 'peer' | 'none';

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/** The eight 16-bit groups of a valid IPv6 address, or `null` (embedded IPv4 tails included). */
function ipv6Groups(ip: string): number[] | null {
  let text = ip;
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (isIP(tail) !== 4) return null;
    const [a = 0, b = 0, c = 0, d = 0] = tail.split('.').map(Number);
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const parse = (part: string) => (part === '' ? [] : part.split(':').map((g) => parseInt(g, 16)));
  const head = parse(halves[0] ?? '');
  const rest = halves.length === 2 ? parse(halves[1] ?? '') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<number>(missing).fill(0), ...rest];
  return groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/**
 * The form an address is counted under: IPv4 as is (IPv4-mapped IPv6 turned back into IPv4) and
 * IPv6 cut to its /64, since one subscriber usually holds a whole /64 and could otherwise rotate
 * through it. Anything that is not an address gives `null`.
 */
export function normalizeIp(ip: string): string | null {
  const value = ip.trim().replace(/%.*$/, '');
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6) return null;
  const mapped = IPV4_MAPPED.exec(value);
  if (mapped?.[1] && isIP(mapped[1]) === 4) return mapped[1];
  const groups = ipv6Groups(value);
  if (!groups) return null;
  // Still a valid address (the /64 with its host bits zeroed), so it also fits Better Auth's
  // session `ip_address`.
  return `${groups
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(':')}::`;
}

/** Like `clientIp`, plus where the address came from (for a one-off startup log). */
export function resolveClientIp(
  request: Request,
  { trustCf }: ClientIpOptions,
): { ip: string | null; source: ClientIpSource } {
  if (trustCf) {
    const header = request.headers.get('cf-connecting-ip');
    const ip = header === null ? null : normalizeIp(header);
    if (ip) return { ip, source: 'cf-connecting-ip' };
  }
  // srvx (the Node server under TanStack Start/Nitro) exposes the TCP peer as `request.ip`. It
  // ignores `X-Forwarded-For` unless told to trust a proxy, which this app never does.
  const peer: unknown = 'ip' in request ? request.ip : undefined;
  const ip = typeof peer === 'string' ? normalizeIp(peer) : null;
  return ip ? { ip, source: 'peer' } : { ip: null, source: 'none' };
}

/**
 * The single source of the client address for rate limits and read caps. Without `trustCf` every
 * header (`CF-Connecting-IP`, `X-Forwarded-For`) is ignored, since clients can set them. `null`
 * when the runtime gives no address: only per-user limits apply then.
 */
export function clientIp(request: Request, opts: ClientIpOptions): string | null {
  return resolveClientIp(request, opts).ip;
}

/**
 * `clientIp` bound to its options, logging once which source answered (never the address), so a
 * deployment where every request lands in one bucket (`none`) shows up in the log.
 */
export function createClientIpResolver(opts: ClientIpOptions): (request: Request) => string | null {
  let logged = false;
  return (request) => {
    const { ip, source } = resolveClientIp(request, opts);
    if (!logged) {
      logged = true;
      const write = source === 'none' ? console.warn : console.info;
      write(`[rate-limit] client IP source: ${source}`);
    }
    return ip;
  };
}
