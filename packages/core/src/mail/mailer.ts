import nodemailer from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send: (msg: MailMessage) => Promise<void>;
}

export type MailerConfig =
  | { mode: 'log' }
  | { mode: 'smtp'; host: string; port: number; user?: string; pass?: string; from: string };

/**
 * `smtp`: gửi qua nodemailer (465 dùng TLS ngay, cổng khác STARTTLS).
 * `log`: chỉ cho dev/test, in mail ra console để copy link; production thì throw ngay khi
 * tạo, không bao giờ ghi link chứa token ra log.
 */
export function createMailer(cfg: MailerConfig): Mailer {
  if (cfg.mode === 'log') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Mailer chế độ log không được dùng ở production (thiếu SMTP)');
    }
    return {
      send: (msg) => {
        console.info(`[mail:dev] tới ${msg.to} — ${msg.subject}\n${msg.text}`);
        return Promise.resolve();
      },
    };
  }

  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return {
    send: async (msg) => {
      await transport.sendMail({ from: cfg.from, ...msg });
    },
  };
}

/** Chọn chế độ từ env: có `SMTP_HOST` thì gửi thật, không thì in ra log. */
export function mailerConfigFromEnv(env: {
  SMTP_HOST?: string | undefined;
  SMTP_PORT: number;
  SMTP_USER?: string | undefined;
  SMTP_PASS?: string | undefined;
  SMTP_FROM?: string | undefined;
}): MailerConfig {
  if (env.SMTP_HOST === undefined) return { mode: 'log' };
  if (env.SMTP_FROM === undefined) throw new Error('Có SMTP_HOST thì phải có SMTP_FROM');
  return {
    mode: 'smtp',
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  };
}
