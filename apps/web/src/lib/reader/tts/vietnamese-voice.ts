/** The part of `window.speechSynthesis` used to list voices. */
export type VoicePort = Pick<
  SpeechSynthesis,
  'getVoices' | 'addEventListener' | 'removeEventListener'
>;

const VIETNAMESE = /^vi(?:[-_]|$)/i;

/**
 * The voice to read Vietnamese with, or `null` when the device has none: `vi-VN` before a bare
 * `vi`, then a voice on the device before one that sends the text to a server.
 */
export function pickVietnameseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const score = (voice: SpeechSynthesisVoice) =>
    (/^vi[-_]vn$/i.test(voice.lang) ? 2 : 0) + (voice.localService ? 1 : 0);
  let best: SpeechSynthesisVoice | null = null;
  for (const voice of voices) {
    if (VIETNAMESE.test(voice.lang) && (!best || score(voice) > score(best))) best = voice;
  }
  return best;
}

/**
 * The device's voices. Most browsers list none until `voiceschanged` has fired once; after
 * `timeoutMs` without any, the answer is the empty list.
 */
export function waitForVoices(port: VoicePort, timeoutMs = 3000): Promise<SpeechSynthesisVoice[]> {
  const now = port.getVoices();
  if (now.length > 0) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      port.removeEventListener('voiceschanged', onChange);
      resolve(port.getVoices());
    };
    const onChange = () => {
      if (port.getVoices().length > 0) done();
    };
    const timer = setTimeout(done, timeoutMs);
    port.addEventListener('voiceschanged', onChange);
  });
}
