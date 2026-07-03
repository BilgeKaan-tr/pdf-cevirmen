import type { PDFPageProxy } from "pdfjs-dist";
import type { Block } from "../types";

export const MAX_EDGE_PX = 3000;
const MASK_PAD_PT = 1.5;

export function computeScale(widthPt: number, heightPt: number): number {
  return Math.min(2, MAX_EDGE_PX / Math.max(widthPt, heightPt));
}

export interface Bitmap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function sampleBackground(
  bmp: Bitmap,
  rect: { x: number; y: number; width: number; height: number }
): [number, number, number] {
  const pad = 3;
  const x0 = Math.min(bmp.width - 1, Math.max(0, Math.round(rect.x) - pad));
  const x1 = Math.min(bmp.width - 1, Math.max(0, Math.round(rect.x + rect.width) + pad));
  const y0 = Math.min(bmp.height - 1, Math.max(0, Math.round(rect.y) - pad));
  const y1 = Math.min(bmp.height - 1, Math.max(0, Math.round(rect.y + rect.height) + pad));
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const stepX = Math.max(1, Math.floor((x1 - x0) / 20));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 20));
  const push = (x: number, y: number) => {
    const o = (y * bmp.width + x) * 4;
    rs.push(bmp.data[o]); gs.push(bmp.data[o + 1]); bs.push(bmp.data[o + 2]);
  };
  for (let x = x0; x <= x1; x += stepX) { push(x, y0); push(x, y1); }
  for (let y = y0; y <= y1; y += stepY) { push(x0, y); push(x1, y); }
  const med = (a: number[]) => {
    if (a.length === 0) return 255;
    const s = [...a].sort((p, q) => p - q);
    return s[Math.floor(s.length / 2)];
  };
  return [med(rs), med(gs), med(bs)];
}

// ---- Aşağıdakiler tarayıcı ortamı gerektirir ----

export async function renderPageToCanvas(page: PDFPageProxy, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d bağlamı alınamadı");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export function maskBlocks(canvas: HTMLCanvasElement, blocks: Block[], scale: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bmp: Bitmap = { data: img.data, width: img.width, height: img.height };
  for (const b of blocks) {
    if (!b.translated) continue;
    const rect = {
      x: (b.x - MASK_PAD_PT) * scale,
      y: (b.y - MASK_PAD_PT) * scale,
      width: (b.width + 2 * MASK_PAD_PT) * scale,
      height: (b.height + 2 * MASK_PAD_PT) * scale,
    };
    const [r, g, bb] = sampleBackground(bmp, rect);
    ctx.fillStyle = `rgb(${r},${g},${bb})`;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error("JPEG oluşturulamadı"));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      "image/jpeg",
      quality
    );
  });
}

export function makePreview(canvas: HTMLCanvasElement, maxWidth = 900): HTMLCanvasElement {
  const ratio = Math.min(1, maxWidth / canvas.width);
  const small = document.createElement("canvas");
  small.width = Math.floor(canvas.width * ratio);
  small.height = Math.floor(canvas.height * ratio);
  small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
  return small;
}
