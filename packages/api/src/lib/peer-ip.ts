/**
 * The address of the TCP peer, from srvx's `request.ip`. `null` when the runtime does not expose
 * it (other adapters, some dev setups). Behind Cloudflare this is an edge address, not the
 * reader's: trusting `CF-Connecting-IP` comes with the rate limiting work and must land before the
 * origin is put behind Cloudflare.
 */
export function peerIp(request: Request): string | null {
  const ip: unknown = 'ip' in request ? request.ip : undefined;
  return typeof ip === 'string' && ip.length > 0 ? ip : null;
}
