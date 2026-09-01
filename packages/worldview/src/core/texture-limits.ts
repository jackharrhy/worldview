import { invariant } from './errors.js';

// WebGPU implementations are required to support 8,192 texels per 2D dimension. Keeping decoded
// source images inside that portable floor prevents a valid decode from becoming a GPU validation
// error on a conforming, lower-limit adapter.
export const MAX_TEXTURE_DIMENSION = 8_192;
export const MAX_DECODED_TEXTURE_PIXELS = 16_777_216;

export function validateTextureDimensions(width: number, height: number, label: string): void {
  invariant(width > 0 && height > 0, `${label} has zero dimensions`);
  invariant(
    width <= MAX_TEXTURE_DIMENSION && height <= MAX_TEXTURE_DIMENSION,
    `${label} dimensions exceed the portable WebGPU texture limit`,
  );
  invariant(
    width * height <= MAX_DECODED_TEXTURE_PIXELS,
    `${label} dimensions exceed the decoded image limit`,
  );
}
