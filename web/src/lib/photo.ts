import { EXPERIENCE_LIMITS } from "@assma/shared";

const SIZE = 800;

/**
 * Turns a photo file into the square JPEG assma stores: the centre crop, at most 800 × 800,
 * with the camera's rotation applied. Returns base64 without the data-URL prefix.
 */
export async function preparePhoto(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type) || file.size > 25 * 1024 * 1024) {
    throw new Error("invalid_image");
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const size = Math.min(SIZE, side);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("invalid_image");
    }
    context.imageSmoothingQuality = "high";
    // Portraits are usually framed high: crop a little above the centre.
    const left = (bitmap.width - side) / 2;
    const top =
      bitmap.height > bitmap.width ? (bitmap.height - side) * 0.3 : (bitmap.height - side) / 2;
    context.drawImage(bitmap, left, top, side, side, 0, 0, size, size);
    for (const quality of [0.9, 0.82, 0.72, 0.6]) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", quality),
      );
      if (blob && blob.size <= EXPERIENCE_LIMITS.imageBytes) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
        }
        return btoa(binary);
      }
    }
    throw new Error("invalid_image");
  } finally {
    bitmap.close();
  }
}

/** The bytes of a "data:image/jpeg;base64,…" URL, for the PDF. */
export function dataUrlBytes(dataUrl: string): Uint8Array {
  const binary = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
