import { describe, expect, it } from 'vitest';
import { BOOT_SCRIPT, MATURE_FLAG_KEY } from './boot-script';

/** Runs the script against fake `window`/`document`; returns the attributes it set on `<html>`. */
function run(getItem: (key: string) => string | null): Record<string, string> {
  const attributes: Record<string, string> = {};
  const document = {
    documentElement: {
      setAttribute: (name: string, value: string) => {
        attributes[name] = value;
      },
    },
  };
  const window = { localStorage: { getItem } };
  // Runs the static inline script the way the browser would, against the fakes.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const script = new Function('window', 'document', BOOT_SCRIPT) as (
    w: unknown,
    d: unknown,
  ) => void;
  script(window, document);
  return attributes;
}

describe('BOOT_SCRIPT', () => {
  it('marks <html> when the 18+ flag is set', () => {
    expect(run((key) => (key === MATURE_FLAG_KEY ? '1' : null))).toEqual({ 'data-mature-ok': '' });
  });

  it('leaves <html> alone without the flag', () => {
    expect(run(() => null)).toEqual({});
  });

  it('does not throw when storage is blocked', () => {
    expect(
      run(() => {
        throw new Error('SecurityError');
      }),
    ).toEqual({});
  });
});
