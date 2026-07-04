import { describe, it, expect } from "vitest";
import { filterNonOverlapping } from "../src/ocr/overlap";
import type { Block } from "../src/types";

const block = (x: number, y: number, w: number, h: number): Block => ({
  text: "t", x, y, width: w, height: h, fontSize: 10,
  bold: false, translatable: true, translated: null, failed: false,
});

describe("filterNonOverlapping", () => {
  const textBlocks = [block(100, 100, 200, 50)];
  it("metin katmanıyla büyük örtüşen OCR bloğu elenir", () => {
    // OCR bloğu metin bloğunun tam üstünde → %100 örtüşme
    expect(filterNonOverlapping([block(110, 105, 180, 40)], textBlocks)).toHaveLength(0);
  });
  it("örtüşmeyen OCR bloğu kalır (figür yazısı)", () => {
    expect(filterNonOverlapping([block(400, 400, 100, 30)], textBlocks)).toHaveLength(1);
  });
  it("küçük kenar teması (<%30) elenmez", () => {
    // OCR: 100x100 alanın yalnızca %4'ü metin bloğuna değiyor
    const ocr = block(280, 130, 100, 100); // kesişim: 20x20=400 / 10000 = %4
    expect(filterNonOverlapping([ocr], textBlocks)).toHaveLength(1);
  });
  it("sıfır alanlı blok elenir", () => {
    expect(filterNonOverlapping([block(0, 0, 0, 10)], textBlocks)).toHaveLength(0);
  });
});
