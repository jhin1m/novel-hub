import { describe, expect, it } from 'vitest';
import type { NominationStatus } from '@/lib/nominations';
import { nominateButtonView } from './nominate-button-view';

const signedIn = { meUnknown: false, signedIn: true, isOwner: false, statusNotFound: false };
const status = (s: Partial<NominationStatus> = {}): NominationStatus => ({
  remaining: 3,
  nominated: false,
  eligibility: 'ok',
  ...s,
});

describe('nominateButtonView', () => {
  it('is the neutral button while the account or its status is unknown, as on the server', () => {
    expect(
      nominateButtonView({ ...signedIn, meUnknown: true, signedIn: false, status: undefined }),
    ).toEqual({ kind: 'pending', label: 'Đề cử' });
    expect(nominateButtonView({ ...signedIn, status: undefined }).kind).toBe('pending');
  });

  it('sends guests to sign in and hides the button from the author', () => {
    expect(nominateButtonView({ ...signedIn, signedIn: false, status: undefined }).kind).toBe(
      'guest',
    );
    expect(nominateButtonView({ ...signedIn, isOwner: true, status: undefined }).kind).toBe(
      'hidden',
    );
    expect(
      nominateButtonView({ ...signedIn, status: status({ eligibility: 'own_story' }) }),
    ).toEqual({ kind: 'hidden' });
  });

  it('hides the button on a story without a published chapter', () => {
    expect(nominateButtonView({ ...signedIn, statusNotFound: true, status: undefined })).toEqual({
      kind: 'hidden',
    });
  });

  it('disables the button for a new account and says why', () => {
    expect(nominateButtonView({ ...signedIn, status: status({ eligibility: 'too_new' }) })).toEqual(
      {
        kind: 'disabled',
        label: 'Đề cử',
        note: 'Tài khoản cần ít nhất 7 ngày tuổi để dùng chức năng này.',
      },
    );
    expect(nominateButtonView({ ...signedIn, status: status({ eligibility: 'muted' }) }).kind).toBe(
      'disabled',
    );
  });

  it('shows what is left, the story already nominated and an empty quota', () => {
    expect(nominateButtonView({ ...signedIn, status: status({ remaining: 2 }) })).toEqual({
      kind: 'active',
      label: 'Đề cử',
      note: 'Còn 2 phiếu tuần này',
    });
    expect(
      nominateButtonView({ ...signedIn, status: status({ remaining: 1, nominated: true }) }),
    ).toEqual({ kind: 'disabled', label: 'Đã đề cử', note: 'Còn 1 phiếu tuần này' });
    expect(nominateButtonView({ ...signedIn, status: status({ remaining: 0 }) })).toEqual({
      kind: 'disabled',
      label: 'Hết phiếu tuần này',
    });
  });
});
