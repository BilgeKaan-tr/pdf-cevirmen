import { describe, it, expect } from "vitest";
import { getOcrLang, extractParagraphs, ocrParagraphsToBlocks } from "../src/ocr/ocr";

describe("getOcrLang", () => {
  it("bilinen kodları eşler", () => {
    expect(getOcrLang("en")).toBe("eng");
    expect(getOcrLang("de")).toBe("deu");
    expect(getOcrLang("zh-CN")).toBe("chi_sim");
    expect(getOcrLang("tr")).toBe("tur");
  });
  it("auto ve bilinmeyen kodlar eng'e düşer", () => {
    expect(getOcrLang("auto")).toBe("eng");
    expect(getOcrLang("xx")).toBe("eng");
  });
});

describe("extractParagraphs", () => {
  const para = (text: string, conf = 90) => ({
    text, confidence: conf,
    bbox: { x0: 100, y0: 200, x1: 500, y1: 260 },
    lines: [{}, {}],
  });
  it("v4 biçimi: data.paragraphs okunur", () => {
    const out = extractParagraphs({ paragraphs: [para("Hello world")] });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: "Hello world", confidence: 90, lineCount: 2 });
  });
  it("v5+ biçimi: data.blocks[].paragraphs düzleştirilir", () => {
    const out = extractParagraphs({ blocks: [{ paragraphs: [para("A b")] }, { paragraphs: [para("C d")] }] });
    expect(out.map((p) => p.text)).toEqual(["A b", "C d"]);
  });
  it("bbox'sız/boş paragraflar atlanır, boşluklar sadeleşir", () => {
    const out = extractParagraphs({
      paragraphs: [
        { text: "  çok\n boşluk  ", confidence: 80, bbox: { x0: 0, y0: 0, x1: 10, y1: 10 } },
        { text: "yok" },
      ],
    });
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("çok boşluk");
  });
});

describe("ocrParagraphsToBlocks", () => {
  const p = (text: string, conf: number, lineCount = 2) => ({
    text, confidence: conf, lineCount,
    bbox: { x0: 100, y0: 200, x1: 500, y1: 280 },
  });
  it("piksel bbox'ı ölçeğe bölerek PDF puntosuna çevirir", () => {
    const [b] = ocrParagraphsToBlocks([p("Hello there world", 90)], 2);
    expect(b).toMatchObject({ x: 50, y: 100, width: 200, height: 40, translatable: true });
    // fontSize ≈ (40 / 2 satır) * 0.75 = 15
    expect(b.fontSize).toBeCloseTo(15, 0);
  });
  it("düşük güvenli paragraf elenir", () => {
    expect(ocrParagraphsToBlocks([p("Hello there", 40)], 1)).toHaveLength(0);
  });
  it("çevrilemez metin (yalnız sayı) elenir", () => {
    expect(ocrParagraphsToBlocks([p("12345", 95)], 1)).toHaveLength(0);
  });
});
