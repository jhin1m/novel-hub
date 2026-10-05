import { CLIENT_IP_HEADER } from '@novel-hub/shared';

/**
 * A copy of `request` whose `CLIENT_IP_HEADER` is `ip`, or absent when `ip` is `null`; whatever
 * the client sent under that name is dropped. The body stream is handed over unread.
 *
 * Built from the parts rather than `new Request(request, init)`: under the dev server the incoming
 * request is srvx's own class, which the native constructor rejects as an input.
 */
export function withClientIpHeader(request: Request, ip: string | null): Request {
  const headers = new Headers(request.headers);
  headers.delete(CLIENT_IP_HEADER);
  if (ip !== null) headers.set(CLIENT_IP_HEADER, ip);
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && request.body !== null;
  const init: RequestInit & { duplex?: 'half' } = { method: request.method, headers };
  if (hasBody) {
    init.body = request.body;
    init.duplex = 'half';
  }
  return new Request(request.url, init);
}
