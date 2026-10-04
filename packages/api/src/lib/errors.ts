import type { ErrorHandler, NotFoundHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

/** Dạng lỗi thống nhất của API: `{ error: { code, message } }`. */
export function errorBody<const C extends string>(code: C, message: string) {
  return { error: { code, message } };
}

export type ErrorBody<C extends string = string> = ReturnType<typeof errorBody<C>>;

const CLIENT_ERROR_CODES: Partial<Record<number, string>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
};

export const handleNotFound: NotFoundHandler = (c) =>
  c.json(errorBody('NOT_FOUND', 'Không tìm thấy tài nguyên'), 404);

/**
 * `HTTPException` do Hono hoặc middleware chủ động ném giữ status của nó (kèm response
 * riêng nếu có, ví dụ header `WWW-Authenticate`); 4xx giữ cả message. Mọi lỗi khác
 * thành 500. Lỗi 5xx ghi log đầy đủ ở server, response không có stack hay message gốc.
 */
export const handleError: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    if (err.res) return err.getResponse();
    if (err.status < 500) {
      const code = CLIENT_ERROR_CODES[err.status] ?? 'HTTP_ERROR';
      return c.json(errorBody(code, err.message), err.status);
    }
  }
  console.error(`[api] ${c.req.method} ${c.req.path}:`, err);
  const status = err instanceof HTTPException ? err.status : 500;
  return c.json(errorBody('INTERNAL_ERROR', 'Lỗi máy chủ'), status);
};
