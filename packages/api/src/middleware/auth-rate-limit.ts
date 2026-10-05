import { AUTH_PATH_ACTIONS } from '@novel-hub/shared';
import { createMiddleware } from 'hono/factory';
import { withClientIpHeader } from '../lib/client-ip-header';
import { RATE_LIMITED_MESSAGE, type RateLimitPort } from './rate-limit';

const AUTH_BASE_PATH = '/api/auth';
/**
 * Cap on the bodies of limited auth requests (a few fields). A larger body is refused rather than
 * passed on unread: padding it must not be a way around the per-email limits.
 */
const AUTH_BODY_MAX_BYTES = 16 * 1024;

/** The body of a copy of `request` as text, or `null` past `max` bytes (chunked bodies included). */
async function readCapped(request: Request, max: number): Promise<string | null> {
  if (Number(request.headers.get('content-length')) > max) return null;
  const body = request.clone().body;
  if (!body) return '';
  const reader: ReadableStreamDefaultReader<Uint8Array> = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      // Just stop pulling: cancelling one branch of a cloned body only settles once the other
      // branch is cancelled too, which never happens here.
      reader.releaseLock();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** better-call's test for a JSON body; it runs before the urlencoded one, as there. */
const JSON_CONTENT_TYPE = /^application\/([a-z0-9.+-]*\+)?json/i;

/**
 * The `email` field exactly as Better Auth (better-call `getBody`) will see it, so the limit
 * applies to the address the handler acts on: JSON when the content type says JSON, otherwise a
 * urlencoded form (sign-in accepts one) where a repeated field keeps its last value. `null`: body
 * too large.
 */
async function readEmail(request: Request): Promise<string | undefined | null> {
  const text = await readCapped(request, AUTH_BODY_MAX_BYTES);
  if (text === null) return null;
  const type = (request.headers.get('content-type') ?? '').toLowerCase();
  if (JSON_CONTENT_TYPE.test(type)) {
    try {
      const body: unknown = JSON.parse(text);
      if (typeof body === 'object' && body !== null && 'email' in body) {
        return typeof body.email === 'string' ? body.email : undefined;
      }
    } catch {
      // Better Auth answers malformed JSON with 400; only the IP limits apply here.
    }
    return undefined;
  }
  if (type.includes('application/x-www-form-urlencoded')) {
    return new URLSearchParams(text).getAll('email').at(-1);
  }
  return undefined;
}

/**
 * In front of Better Auth (`/api/auth/*`), whose own limiter is off: one limiter, one IP source,
 * one 429 shape for the whole app.
 *
 * - Every request: the client address goes to Better Auth in `CLIENT_IP_HEADER` (for
 *   `sessions.ip_address`), replacing any value the client sent.
 * - `POST` to a path in `AUTH_PATH_ACTIONS`: body capped at 16 KB (413 above), then checked before
 *   the handler. Over the limit → 429 in
 *   Better Auth's error shape (`{ code, message }`, plus `retryAfterSec` for the form) with
 *   `Retry-After`. The answer is the same whether the email exists or not.
 * - A sign-in answered 401 (wrong email or password) counts towards the email's failure limit.
 */
export function authRateLimit(port: RateLimitPort) {
  return createMiddleware(async (c, next) => {
    const ip = port.clientIp(c.req.raw);
    c.req.raw = withClientIpHeader(c.req.raw, ip);
    const limiter = port.rateLimit;
    const action =
      c.req.method === 'POST'
        ? // Without trailing slashes, in case Better Auth is ever set to ignore them.
          AUTH_PATH_ACTIONS[c.req.path.slice(AUTH_BASE_PATH.length).replace(/\/+$/, '')]
        : undefined;
    if (!limiter || !action) return next();

    const email = await readEmail(c.req.raw);
    if (email === null) {
      return c.json({ code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' }, 413);
    }
    const decision = await limiter.check(action, { ip, email });
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfterSec));
      return c.json(
        {
          code: 'RATE_LIMITED',
          message: RATE_LIMITED_MESSAGE,
          retryAfterSec: decision.retryAfterSec,
        },
        429,
      );
    }
    await next();
    if (action === 'signIn' && email && c.res.status === 401) {
      await limiter.recordFailure('signIn', email);
    }
  });
}
