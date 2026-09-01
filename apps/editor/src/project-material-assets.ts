import { decodeTga } from '@jackharrhy/worldview/core';

export interface DecodedProjectMaterialImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

const MATERIAL_IMAGE_EXTENSION = /\.(png|jpe?g|tga)$/iu;
const MAX_DECODED_IMAGE_PIXELS = 16_777_216;

export function projectMaterialName(logicalPath: string): string | null {
  const match = /^textures\/(.+)\.(?:wal|png|jpe?g|tga)$/iu.exec(logicalPath);
  return match?.[1]?.toLowerCase() ?? null;
}

export async function decodeProjectMaterialImage(
  logicalPath: string,
  bytes: ArrayBuffer,
): Promise<DecodedProjectMaterialImage> {
  const extension = MATERIAL_IMAGE_EXTENSION.exec(logicalPath)?.[1]?.toLowerCase();
  if (!extension) throw new Error(`${logicalPath} is not a supported material image`);
  if (extension === 'tga') return decodeTga(bytes);
  if (typeof createImageBitmap !== 'function') {
    throw new Error(`${logicalPath} requires browser image decoding support`);
  }
  const mediaType = extension === 'png' ? 'image/png' : 'image/jpeg';
  const bitmap = await createImageBitmap(new Blob([bytes], { type: mediaType }));
  try {
    if (bitmap.width * bitmap.height > MAX_DECODED_IMAGE_PIXELS) {
      throw new Error(`${logicalPath} exceeds the decoded image limit`);
    }
    const canvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(bitmap.width, bitmap.height)
        : Object.assign(document.createElement('canvas'), {
            width: bitmap.width,
            height: bitmap.height,
          });
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error(`${logicalPath} could not create an image decoding canvas`);
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return {
      width: bitmap.width,
      height: bitmap.height,
      rgba: new Uint8Array(pixels.data.buffer.slice(0)),
    };
  } finally {
    bitmap.close();
  }
}
