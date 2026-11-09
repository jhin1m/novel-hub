import { afterEach, describe, expect, it, vi } from 'vitest';
import { pickVietnameseVoice, waitForVoices } from './vietnamese-voice';

const voice = (lang: string, localService = true, name = lang) =>
  ({ lang, localService, name }) as SpeechSynthesisVoice;

describe('pickVietnameseVoice', () => {
  it('prefers vi-VN over a bare vi, then a voice on the device', () => {
    const bare = voice('vi');
    const remote = voice('vi-VN', false);
    const local = voice('vi_VN', true);
    expect(pickVietnameseVoice([voice('en-US'), bare, remote])).toBe(remote);
    expect(pickVietnameseVoice([bare, remote, local])).toBe(local);
    expect(pickVietnameseVoice([voice('en-US'), bare])).toBe(bare);
  });

  it('no Vietnamese voice → null', () => {
    expect(pickVietnameseVoice([])).toBeNull();
    expect(pickVietnameseVoice([voice('en-US'), voice('vec-IT')])).toBeNull();
  });
});

function fakePort(initial: SpeechSynthesisVoice[] = []) {
  let voices = initial;
  const target = new EventTarget();
  return {
    getVoices: () => voices,
    addEventListener: vi.fn(target.addEventListener.bind(target)),
    removeEventListener: vi.fn(target.removeEventListener.bind(target)),
    load(next: SpeechSynthesisVoice[]) {
      voices = next;
      target.dispatchEvent(new Event('voiceschanged'));
    },
  };
}

describe('waitForVoices', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('answers at once when the voices are already there', async () => {
    const port = fakePort([voice('vi-VN')]);
    await expect(waitForVoices(port)).resolves.toHaveLength(1);
    expect(port.addEventListener).not.toHaveBeenCalled();
  });

  it('waits for `voiceschanged` with voices in it', async () => {
    vi.useFakeTimers();
    const port = fakePort();
    const result = waitForVoices(port);
    port.load([]);
    await vi.advanceTimersByTimeAsync(1_000);
    port.load([voice('en-US'), voice('vi-VN')]);
    await expect(result).resolves.toHaveLength(2);
    expect(port.removeEventListener).toHaveBeenCalled();
  });

  it('gives up with an empty list after the timeout', async () => {
    vi.useFakeTimers();
    const port = fakePort();
    const result = waitForVoices(port, 3_000);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(result).resolves.toEqual([]);
    expect(port.removeEventListener).toHaveBeenCalled();
  });
});
