import { LIMITS } from '@novel-hub/shared';
import type { Metadata } from 'sharp';
import { type Result, err, ok } from '../lib/result';

export type CoverImageError =
  'FILE_TOO_LARGE' | 'UNSUPPORTED_IMAGE' | 'IMAGE_TOO_SMALL' | 'IMAGE_TOO_LARGE';

/** Pixel ceiling checked from the header before decoding, so a tiny file cannot expand to GBs. */
export const COVER_MAX_PIXELS = 24_000_000;

const ACCEPTED_FORMATS = new Set(['jpeg', 'png', 'webp']);
/** EXIF orientations 5–8 rotate the image by 90°, swapping width and height. */
const SWAPPED_ORIENTATIONS = new Set([5, 6, 7, 8]);
const WEBP_QUALITY = 82;

export interface CoverVariants {
  w600: Buffer;
  w300: Buffer;
}

/**
 * Validates an uploaded cover and renders the two WebP variants (600×900, 300×450), cropped
 * around the most interesting area. The format comes from magic bytes, never from the file name or
 * MIME type. Output carries no metadata (sharp drops EXIF unless asked to keep it).
 */
export async function processCoverImage(
  input: Uint8Array,
): Promise<Result<CoverVariants, CoverImageError>> {
  if (input.byteLength > LIMITS.cover.maxBytes) return err('FILE_TOO_LARGE');

  // Loaded on first use: the native library stays out of processes that never handle images
  // (worker, seed scripts), and a broken install only breaks uploads.
  const { default: sharp } = await import('sharp');
  let meta: Metadata;
  try {
    // `metadata()` only parses the header.
    meta = await sharp(input).metadata();
  } catch {
    return err('UNSUPPORTED_IMAGE');
  }
  if (!ACCEPTED_FORMATS.has(meta.format)) return err('UNSUPPORTED_IMAGE');
  if (meta.width * meta.height > COVER_MAX_PIXELS) return err('IMAGE_TOO_LARGE');

  const swapped = meta.orientation !== undefined && SWAPPED_ORIENTATIONS.has(meta.orientation);
  const width = swapped ? meta.height : meta.width;
  const height = swapped ? meta.width : meta.height;
  if (width < LIMITS.cover.minWidth || height < LIMITS.cover.minHeight) {
    return err('IMAGE_TOO_SMALL');
  }

  const [large, small] = LIMITS.cover.variants;
  try {
    // The original is decoded once; the small variant is scaled down from the large one (same
    // 2:3 crop). `limitInputPixels` is a second guard in case the header lied about the size.
    const w600 = await sharp(input, { limitInputPixels: COVER_MAX_PIXELS, failOn: 'error' })
      .rotate()
      .resize(large.width, large.height, { fit: 'cover', position: 'attention' })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    const w300 = await sharp(w600)
      .resize(small.width, small.height)
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();
    return ok({ w600, w300 });
  } catch {
    // Truncated or corrupt pixel data that the header check could not see.
    return err('UNSUPPORTED_IMAGE');
  }
}
