import { describe, it, expect } from "vitest";
import { computeScale, sampleBackground, type Bitmap } from "../src/pdf/render";

describe("computeScale", () => {
  it("A4 için 2 döner", () => {
    expect(computeScale(595, 842)).toBe(2);
  });
  it("dev sayfada 3000px tavanına iner", () => {
    expect(computeScale(3000, 2000)).toBe(1);
    expect(computeScale(6000, 1000)).toBeCloseTo(0.5);
  });
});

describe("sampleBackground", () => {
  function solidBitmap(w: number, h: number, rgb: [number, number, number]): Bitmap {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
    }
    return { data, width: w, height: h };
  }
  it("kenar renginin medyanını döner", () => {
    const bmp = solidBitmap(100, 100, [250, 240, 230]);
    // merkezi siyah boya (metin gibi) — kenar örneklemesi etkilenmemeli
    for (let y = 40; y < 60; y++) for (let x = 40; x < 60; x++) {
      const o = (y * 100 + x) * 4;
      bmp.data[o] = 0; bmp.data[o + 1] = 0; bmp.data[o + 2] = 0;
    }
    const [r, g, b] = sampleBackground(bmp, { x: 38, y: 38, width: 24, height: 24 });
    expect(r).toBe(250); expect(g).toBe(240); expect(b).toBe(230);
  });
  it("kenar dışına taşan dikdörtgeni kırpar (hata fırlatmaz)", () => {
    const bmp = solidBitmap(10, 10, [255, 255, 255]);
    const [r] = sampleBackground(bmp, { x: -5, y: -5, width: 30, height: 30 });
    expect(r).toBe(255);
  });
});
