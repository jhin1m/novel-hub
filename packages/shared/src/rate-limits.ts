/**
 * Rate limit rules, one per write action. Starting values: tune them here, no migration needed.
 * Every `max` is multiplied by `RATE_LIMIT_FACTOR` (1 in production; e2e raises it so its many
 * sign-ups from one IP are not throttled).
 */
export type RateLimitAction =
  | 'signUp'
  | 'signIn'
  | 'forgotPassword'
  | 'sendVerification'
  | 'createStory'
  | 'uploadCover'
  | 'createChapter'
  | 'publishChapter'
  | 'report'
  | 'comment';

export interface Limit {
  max: number;
  windowSec: number;
}

export interface RateLimitRule {
  /** Per signed-in user; accounts younger than `NEW_ACCOUNT_DAYS` get the stricter tier. */
  user?: { normal: Limit; newAccount: Limit };
  ip?: Limit;
  /** Per (email, IP): the tight lock on guessing one account from one place. */
  emailIp?: Limit;
  /**
   * Per email across every IP. `failure` counts only failed attempts, so someone else cannot lock
   * the owner out by sending requests; `request` counts every request (mail floods).
   */
  emailGlobal?: Limit & { countOn: 'failure' | 'request' };
  /**
   * When Redis is down or slow: `closed` refuses (actions that send mail or create accounts),
   * `open` lets the request through.
   */
  onStoreError: 'open' | 'closed';
}

export const NEW_ACCOUNT_DAYS = 3;

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const RATE_LIMITS: Readonly<Record<RateLimitAction, RateLimitRule>> = {
  signUp: { ip: { max: 5, windowSec: HOUR }, onStoreError: 'closed' },
  signIn: {
    emailIp: { max: 5, windowSec: 15 * MINUTE },
    ip: { max: 20, windowSec: 15 * MINUTE },
    emailGlobal: { max: 50, windowSec: HOUR, countOn: 'failure' },
    onStoreError: 'open',
  },
  forgotPassword: {
    emailIp: { max: 3, windowSec: HOUR },
    ip: { max: 5, windowSec: HOUR },
    emailGlobal: { max: 10, windowSec: DAY, countOn: 'request' },
    onStoreError: 'closed',
  },
  sendVerification: {
    emailIp: { max: 3, windowSec: HOUR },
    ip: { max: 5, windowSec: HOUR },
    emailGlobal: { max: 10, windowSec: DAY, countOn: 'request' },
    onStoreError: 'closed',
  },
  createStory: {
    user: { normal: { max: 5, windowSec: DAY }, newAccount: { max: 2, windowSec: DAY } },
    ip: { max: 20, windowSec: DAY },
    onStoreError: 'open',
  },
  uploadCover: {
    user: { normal: { max: 10, windowSec: HOUR }, newAccount: { max: 5, windowSec: HOUR } },
    ip: { max: 30, windowSec: HOUR },
    onStoreError: 'open',
  },
  createChapter: {
    user: { normal: { max: 50, windowSec: DAY }, newAccount: { max: 10, windowSec: DAY } },
    ip: { max: 100, windowSec: DAY },
    onStoreError: 'open',
  },
  publishChapter: {
    user: { normal: { max: 30, windowSec: HOUR }, newAccount: { max: 10, windowSec: HOUR } },
    ip: { max: 60, windowSec: HOUR },
    onStoreError: 'open',
  },
  report: {
    user: { normal: { max: 10, windowSec: HOUR }, newAccount: { max: 3, windowSec: HOUR } },
    ip: { max: 30, windowSec: HOUR },
    onStoreError: 'open',
  },
  comment: {
    user: {
      normal: { max: 20, windowSec: 10 * MINUTE },
      newAccount: { max: 5, windowSec: 10 * MINUTE },
    },
    ip: { max: 60, windowSec: 10 * MINUTE },
    onStoreError: 'open',
  },
};

/**
 * Better Auth paths (below `/api/auth`) that are limited, all `POST`. Every other auth path
 * (sign-out, session, OAuth callback, email verification link) is not.
 */
export const AUTH_PATH_ACTIONS: Readonly<Record<string, RateLimitAction>> = {
  '/sign-up/email': 'signUp',
  '/sign-in/email': 'signIn',
  '/sign-in/social': 'signIn',
  '/request-password-reset': 'forgotPassword',
  '/send-verification-email': 'sendVerification',
};

/**
 * Internal header carrying the client address from the API to Better Auth
 * (`advanced.ipAddress.ipAddressHeaders`), so `sessions.ip_address` holds the address the rate
 * limits use instead of a client-chosen `X-Forwarded-For`. The API overwrites whatever the client
 * sent under this name.
 */
export const CLIENT_IP_HEADER = 'x-novel-hub-client-ip';
