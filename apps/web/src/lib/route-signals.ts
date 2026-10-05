import { notFound } from '@tanstack/react-router';

/**
 * Ends a loader with the router's 404. `notFound({ throw: true })` throws the router's plain-object
 * signal itself (the lint rule only accepts throwing `Error`s); `never` lets callers narrow on it.
 */
export function throwNotFound(): never {
  return notFound({ throw: true }) as never;
}
