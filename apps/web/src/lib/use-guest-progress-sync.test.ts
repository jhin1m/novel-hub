import type { GuestProgressItem } from '@novel-hub/shared';
import { type Mock, describe, expect, it, vi } from 'vitest';
import { type GuestSyncSteps, syncGuestProgress } from './use-guest-progress-sync';

// The sync logic takes its steps as arguments; these imports only serve the hook around it.
vi.mock('../server-fns/reading', () => ({ getGuestContinue: vi.fn() }));
vi.mock('./api-client', () => ({ createApiClient: () => ({}) }));
vi.mock('./library', () => ({ historyQueryKey: ['me', 'history'] }));
vi.mock('./me', () => ({ useMe: () => ({ data: undefined }) }));

const item = (letter: string, number = 5, updatedAt = 1): GuestProgressItem => ({
  publicId: letter.repeat(8),
  number,
  scrollPct: 40,
  updatedAt,
});

type StepMocks = { [K in keyof GuestSyncSteps]: Mock<GuestSyncSteps[K]> };

function steps(overrides: Partial<StepMocks> = {}): StepMocks {
  return {
    isReadable: vi.fn<GuestSyncSteps['isReadable']>(() => Promise.resolve(true)),
    accountChapter: vi.fn<GuestSyncSteps['accountChapter']>(() => Promise.resolve(null)),
    put: vi.fn<GuestSyncSteps['put']>(() => Promise.resolve(204)),
    remove: vi.fn<GuestSyncSteps['remove']>(),
    ...overrides,
  };
}

describe('syncGuestProgress', () => {
  it('writes a story the account never read, then forgets it', async () => {
    const s = steps();
    expect(await syncGuestProgress([item('a')], s)).toBe(true);
    expect(s.put).toHaveBeenCalledWith(item('a'));
    expect(s.remove).toHaveBeenCalledWith(item('a'));
  });

  it('writes when the local chapter is ahead of the account', async () => {
    const s = steps({ accountChapter: vi.fn(() => Promise.resolve(4)) });
    expect(await syncGuestProgress([item('a', 5)], s)).toBe(true);
    expect(s.put).toHaveBeenCalledOnce();
  });

  it.each([
    ['ahead', 50],
    ['on the same chapter', 5],
  ])('never moves back an account that is %s', async (_, chapter) => {
    // The saved time is far in the future: clocks play no part.
    const newest = item('a', 5, Number.MAX_SAFE_INTEGER);
    const s = steps({ accountChapter: vi.fn(() => Promise.resolve(chapter)) });

    expect(await syncGuestProgress([newest], s)).toBe(false);

    expect(s.put).not.toHaveBeenCalled();
    expect(s.remove).toHaveBeenCalledWith(newest);
  });

  it('does not write a chapter that became unreadable or 18+, and forgets it', async () => {
    const s = steps({ isReadable: vi.fn(() => Promise.resolve(false)) });
    expect(await syncGuestProgress([item('a')], s)).toBe(false);
    expect(s.accountChapter).not.toHaveBeenCalled();
    expect(s.put).not.toHaveBeenCalled();
    expect(s.remove).toHaveBeenCalledWith(item('a'));
  });

  it('keeps everything and stops when the readability check fails', async () => {
    const s = steps({ isReadable: vi.fn(() => Promise.reject(new Error('503'))) });
    await syncGuestProgress([item('a'), item('b')], s);
    expect(s.isReadable).toHaveBeenCalledOnce();
    expect(s.put).not.toHaveBeenCalled();
    expect(s.remove).not.toHaveBeenCalled();
  });

  it('keeps everything and never writes when the account position cannot be read', async () => {
    const s = steps({ accountChapter: vi.fn(() => Promise.reject(new Error('500'))) });
    await syncGuestProgress([item('a'), item('b')], s);
    expect(s.put).not.toHaveBeenCalled();
    expect(s.remove).not.toHaveBeenCalled();
  });

  it.each([401, 429, 500, 503])('keeps everything and stops on a %i write', async (status) => {
    const s = steps({ put: vi.fn(() => Promise.resolve(status)) });
    expect(await syncGuestProgress([item('a'), item('b')], s)).toBe(false);
    expect(s.put).toHaveBeenCalledOnce();
    expect(s.remove).not.toHaveBeenCalled();
  });

  it('keeps everything and stops when the write has no answer', async () => {
    const s = steps({ put: vi.fn(() => Promise.reject(new TypeError('offline'))) });
    await syncGuestProgress([item('a'), item('b')], s);
    expect(s.remove).not.toHaveBeenCalled();
  });

  it.each([400, 404])('forgets a position the server refuses (%i) and goes on', async (status) => {
    const put = vi.fn<GuestSyncSteps['put']>().mockResolvedValueOnce(status).mockResolvedValue(204);
    const s = steps({ put });
    expect(await syncGuestProgress([item('a'), item('b')], s)).toBe(true);
    expect(s.remove).toHaveBeenCalledTimes(2);
  });

  it('goes oldest first, so the latest read lands on top of the history', async () => {
    const s = steps();
    await syncGuestProgress([item('a'), item('b'), item('c')], s);
    expect(s.put.mock.calls.map(([saved]) => saved.publicId[0])).toEqual(['c', 'b', 'a']);
  });

  it('reports a write made before a later failure', async () => {
    const put = vi.fn<GuestSyncSteps['put']>().mockResolvedValueOnce(204).mockResolvedValue(500);
    const s = steps({ put });
    expect(await syncGuestProgress([item('a'), item('b')], s)).toBe(true);
    expect(s.remove).toHaveBeenCalledOnce();
    expect(s.remove).toHaveBeenCalledWith(item('b'));
  });
});
