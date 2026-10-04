import { describe, expect, it } from 'vitest';
import { assertSeedAllowed } from './guard';

const LOCAL = 'postgres://u:secret-pw@localhost:5432/novel_hub';

describe('assertSeedAllowed', () => {
  it('development hoặc test + localhost → cho phép', () => {
    expect(() => assertSeedAllowed({ nodeEnv: 'development', databaseUrl: LOCAL })).not.toThrow();
    expect(() => assertSeedAllowed({ nodeEnv: 'test', databaseUrl: LOCAL })).not.toThrow();
  });

  it('chấp nhận 127.0.0.1 và ::1', () => {
    for (const url of ['postgres://u:p@127.0.0.1/db', 'postgres://u:p@[::1]:5432/db']) {
      expect(() => assertSeedAllowed({ nodeEnv: 'development', databaseUrl: url })).not.toThrow();
    }
  });

  it('thiếu NODE_ENV → từ chối', () => {
    expect(() => assertSeedAllowed({ nodeEnv: undefined, databaseUrl: LOCAL })).toThrow(/chưa đặt/);
  });

  it('production hoặc giá trị lạ → từ chối', () => {
    for (const nodeEnv of ['production', 'staging', '', 'Development']) {
      expect(() => assertSeedAllowed({ nodeEnv, databaseUrl: LOCAL })).toThrow(/NODE_ENV/);
    }
  });

  it('host không phải local → từ chối', () => {
    for (const url of [
      'postgres://u:p@db.example.com:5432/novel_hub',
      'postgres://u:p@10.0.0.5/novel_hub',
      'postgres://u:p@localhost.evil.com/novel_hub',
    ]) {
      expect(() => assertSeedAllowed({ nodeEnv: 'development', databaseUrl: url })).toThrow(
        /localhost/,
      );
    }
  });

  it('host đặt qua query string (pg ưu tiên nó hơn host của URL) → từ chối', () => {
    for (const url of [
      'postgres://u:p@localhost/novel_hub?host=db.prod.example.com',
      'postgres://u:p@localhost/novel_hub?sslmode=disable&host=localhost',
      'postgres://u:p@127.0.0.1/novel_hub?hostaddr=10.0.0.5',
    ]) {
      expect(() => assertSeedAllowed({ nodeEnv: 'development', databaseUrl: url })).toThrow(
        /query string/,
      );
    }
  });

  it('URL hỏng hoặc kết nối qua socket (host trống) → từ chối', () => {
    expect(() => assertSeedAllowed({ nodeEnv: 'development', databaseUrl: 'not a url' })).toThrow(
      /không hợp lệ/,
    );
    expect(() =>
      assertSeedAllowed({
        nodeEnv: 'development',
        databaseUrl: 'postgres://u:p@/novel_hub',
      }),
    ).toThrow(/không hợp lệ/);
    expect(() =>
      assertSeedAllowed({ nodeEnv: 'development', databaseUrl: 'postgres:///novel_hub' }),
    ).toThrow(/localhost/);
  });

  it('message lỗi không chứa mật khẩu', () => {
    const cases = [
      { nodeEnv: 'production', databaseUrl: LOCAL },
      { nodeEnv: 'development', databaseUrl: 'postgres://u:secret-pw@db.example.com/novel_hub' },
    ];
    for (const input of cases) {
      let message = '';
      try {
        assertSeedAllowed(input);
      } catch (err) {
        message = err instanceof Error ? err.message : '';
      }
      expect(message).toMatch(/^Từ chối seed/);
      expect(message).not.toContain('secret-pw');
    }
  });
});
