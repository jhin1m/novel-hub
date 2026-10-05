import { describe, expect, it } from 'vitest';
import { duplicateReportDetail, fingerprintChapterPayload, sendAuthEmailPayload } from './queues';

const valid = {
  kind: 'verify',
  to: 'an@example.com',
  displayName: 'An',
  url: 'http://localhost:3000/api/auth/verify-email?token=abc',
};

describe('sendAuthEmailPayload', () => {
  it('payload hợp lệ → parse được', () => {
    expect(sendAuthEmailPayload.parse(valid)).toEqual(valid);
    expect(sendAuthEmailPayload.parse({ ...valid, kind: 'reset' }).kind).toBe('reset');
  });

  it.each([
    ['kind lạ', { ...valid, kind: 'welcome' }],
    ['email sai', { ...valid, to: 'khong-phai-email' }],
    ['url sai', { ...valid, url: 'khong-phai-url' }],
    ['thiếu displayName', { kind: valid.kind, to: valid.to, url: valid.url }],
  ])('%s → lỗi', (_label, input) => {
    expect(sendAuthEmailPayload.safeParse(input).success).toBe(false);
  });
});

const CHAPTER = '01920000-0000-7000-8000-000000000002';

describe('fingerprintChapterPayload', () => {
  it('accepts a chapter id and rejects anything else', () => {
    expect(fingerprintChapterPayload.parse({ chapterId: CHAPTER })).toEqual({ chapterId: CHAPTER });
    expect(fingerprintChapterPayload.safeParse({ chapterId: 'x' }).success).toBe(false);
    expect(fingerprintChapterPayload.safeParse({}).success).toBe(false);
  });
});

describe('duplicateReportDetail', () => {
  it('round-trips through JSON and bounds the scores', () => {
    const detail = { matchedChapterId: CHAPTER, jaccard: 0.92, hamming: 3 };
    expect(duplicateReportDetail.parse(JSON.parse(JSON.stringify(detail)))).toEqual(detail);
    expect(duplicateReportDetail.safeParse({ ...detail, jaccard: 1.2 }).success).toBe(false);
    expect(duplicateReportDetail.safeParse({ ...detail, hamming: 65 }).success).toBe(false);
  });
});
