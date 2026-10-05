import { zValidator } from '@hono/zod-validator';
import type { ValidationTargets } from 'hono';
import type { ZodType } from 'zod';
import { errorBody } from './errors';

/**
 * `zValidator` with the API error shape: invalid input → 400 `VALIDATION_ERROR`. Zod issues are
 * not echoed back; forms validate with the same shared schema before sending.
 */
export function validate<T extends keyof ValidationTargets, S extends ZodType>(
  target: T,
  schema: S,
) {
  return zValidator(target, schema, (result, c) => {
    if (!result.success) {
      return c.json(errorBody('VALIDATION_ERROR', 'Invalid request data'), 400);
    }
  });
}
