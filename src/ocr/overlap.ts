import type { Block } from "../types";

/**
 * Figür modunda, metin katmanının zaten kapsadığı bölgelerdeki OCR bloklarını
 * eler (aynı metni iki kez çevirmemek için). Eşik: OCR bloğu alanının %30'u.
 */
export function filterNonOverlapping(
  ocrBlocks: Block[],
  textBlocks: Block[],
  threshold = 0.3
): Block[] {
  return ocrBlocks.filter((o) => {
    const area = o.width * o.height;
    if (area <= 0) return false;
    for (const t of textBlocks) {
      const ix = Math.min(o.x + o.width, t.x + t.width) - Math.max(o.x, t.x);
      const iy = Math.min(o.y + o.height, t.y + t.height) - Math.max(o.y, t.y);
      if (ix > 0 && iy > 0 && (ix * iy) / area > threshold) return false;
    }
    return true;
  });
}
