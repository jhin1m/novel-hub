import { describe, expect, it } from 'vitest';
import { PID_PATTERN, generatePid, isValidPid } from './pid';

describe('generatePid', () => {
  it('always matches PID_PATTERN', () => {
    for (let i = 0; i < 1_000; i += 1) expect(generatePid()).toMatch(PID_PATTERN);
  });
});

describe('isValidPid', () => {
  it('accepts 8 lowercase letters/digits 2-9 only', () => {
    expect(isValidPid('k7m2xq9p')).toBe(true);
    expect(isValidPid('p1')).toBe(false);
    expect(isValidPid('K7M2XQ9P')).toBe(false);
    expect(isValidPid(12345678)).toBe(false);
  });
});
