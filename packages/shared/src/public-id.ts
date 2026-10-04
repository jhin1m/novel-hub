/** Chữ thường + số, bỏ ký tự dễ nhầm `0 o 1 l i`. */
export const PUBLIC_ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const PUBLIC_ID_LENGTH = 8;

const PUBLIC_ID_PATTERN = new RegExp(`^[${PUBLIC_ID_ALPHABET}]{${PUBLIC_ID_LENGTH}}$`);

// Byte >= ngưỡng này bị loại để mọi ký tự có xác suất như nhau (tránh lệch do modulo).
const REJECTION_THRESHOLD = 256 - (256 % PUBLIC_ID_ALPHABET.length);

/**
 * Sinh mã công khai ngẫu nhiên 8 ký tự bằng CSPRNG. Không đảm bảo duy nhất:
 * nơi INSERT phải bắt lỗi unique rồi sinh lại.
 */
export function generatePublicId(): string {
  let id = '';
  const bytes = new Uint8Array(PUBLIC_ID_LENGTH * 2);
  while (id.length < PUBLIC_ID_LENGTH) {
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= REJECTION_THRESHOLD) continue;
      id += PUBLIC_ID_ALPHABET[byte % PUBLIC_ID_ALPHABET.length];
      if (id.length === PUBLIC_ID_LENGTH) break;
    }
  }
  return id;
}

export function isValidPublicId(id: string): boolean {
  return PUBLIC_ID_PATTERN.test(id);
}
