import sharp, { type Sharp } from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { processCoverImage } from './cover';

function solid(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#a8432a' } });
}

async function bytes(image: Sharp): Promise<Uint8Array> {
  return new Uint8Array(await image.toBuffer());
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('processCoverImage', () => {
  it('renders 600×900 and 300×450 WebP variants without metadata', async () => {
    const result = await processCoverImage(await bytes(solid(800, 1200).png()));
    if (!result.ok) throw new Error(result.error);
    for (const [buffer, width, height] of [
      [result.value.w600, 600, 900],
      [result.value.w300, 300, 450],
    ] as const) {
      const meta = await sharp(buffer).metadata();
      expect(meta).toMatchObject({ format: 'webp', width, height });
      expect(meta.exif).toBeUndefined();
    }
  });

  it('accepts a 900×600 JPEG whose EXIF orientation 6 makes it portrait', async () => {
    const input = await bytes(solid(900, 600).jpeg().withMetadata({ orientation: 6 }));
    const result = await processCoverImage(input);
    if (!result.ok) throw new Error(result.error);
    expect(await sharp(result.value.w600).metadata()).toMatchObject({ width: 600, height: 900 });
  });

  it('accepts WebP input', async () => {
    const result = await processCoverImage(await bytes(solid(600, 900).webp()));
    expect(result.ok).toBe(true);
  });

  it('rejects images below 600×900', async () => {
    expect(await processCoverImage(await bytes(solid(500, 800).png()))).toEqual({
      ok: false,
      error: 'IMAGE_TOO_SMALL',
    });
    // Landscape 900×600 without an orientation tag stays too short.
    expect(await processCoverImage(await bytes(solid(900, 600).jpeg()))).toEqual({
      ok: false,
      error: 'IMAGE_TOO_SMALL',
    });
  });

  it('rejects a 30 MP PNG from its header, before decoding', async () => {
    const input = await bytes(solid(6000, 5000).png({ compressionLevel: 9 }));
    expect(input.byteLength).toBeLessThan(5 * 1024 * 1024);
    const resize = vi.spyOn(sharp.prototype, 'resize');
    expect(await processCoverImage(input)).toEqual({ ok: false, error: 'IMAGE_TOO_LARGE' });
    expect(resize).not.toHaveBeenCalled();
  });

  it('rejects non-image bytes and unsupported formats regardless of the file name', async () => {
    const text = new TextEncoder().encode('just text renamed to cover.jpg');
    expect(await processCoverImage(text)).toEqual({ ok: false, error: 'UNSUPPORTED_IMAGE' });
    const gif = await bytes(solid(600, 900).gif());
    expect(await processCoverImage(gif)).toEqual({ ok: false, error: 'UNSUPPORTED_IMAGE' });
  });

  it('rejects files above 5 MB before touching sharp', async () => {
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    expect(await processCoverImage(big)).toEqual({ ok: false, error: 'FILE_TOO_LARGE' });
  });
});
