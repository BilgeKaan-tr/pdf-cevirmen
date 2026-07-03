import { describe, it, expect } from "vitest";
import { toRawItems, groupIntoLines, groupIntoBlocks } from "../src/pdf/grouping";
import type { RawItem } from "../src/types";

// yardımcı: basit RawItem üret
function item(text: string, x: number, y: number, w: number, fs = 10, fontName = "F1"): RawItem {
  return { text, x, y, width: w, height: fs, fontSize: fs, fontName };
}

describe("toRawItems", () => {
  it("pdf.js öğesini üstten-y koordinatına çevirir", () => {
    // pageHeight=800, taban çizgisi f=700, yükseklik 12 → üst kenar y = 800-700-12 = 88
    const out = toRawItems(
      [{ str: "Merhaba", transform: [12, 0, 0, 12, 50, 700], width: 40, height: 12, fontName: "F1" }],
      800
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: "Merhaba", x: 50, y: 88, fontSize: 12 });
  });
  it("boş öğeleri atar", () => {
    expect(toRawItems([{ str: "  ", transform: [10, 0, 0, 10, 0, 0], width: 5, height: 10 }], 800)).toHaveLength(0);
  });
});

describe("groupIntoLines", () => {
  it("aynı taban çizgisindeki öğeleri boşlukla birleştirir", () => {
    const lines = groupIntoLines([item("Hello", 10, 100, 30), item("world", 45, 100.5, 30)]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Hello world");
    expect(lines[0].width).toBeCloseTo(65, 0);
  });
  it("bitişik öğeleri boşluksuz birleştirir", () => {
    const lines = groupIntoLines([item("Mer", 10, 100, 20), item("haba", 30.5, 100, 25)]);
    expect(lines[0].text).toBe("Merhaba");
  });
  it("farklı y'deki öğeler ayrı satır olur", () => {
    const lines = groupIntoLines([item("üst", 10, 100, 20), item("alt", 10, 130, 20)]);
    expect(lines).toHaveLength(2);
  });
});

describe("groupIntoBlocks", () => {
  const line = (text: string, y: number, fs = 10, x = 10, w = 200) =>
    ({ text, x, y, width: w, height: fs, fontSize: fs, bold: false });
  it("yakın satırlar tek blok olur, metin akar", () => {
    const blocks = groupIntoBlocks([line("Birinci satır", 100), line("ikinci satır.", 112)]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("Birinci satır ikinci satır.");
    expect(blocks[0].translatable).toBe(true);
  });
  it("tire ile bölünen kelime birleşir", () => {
    const blocks = groupIntoBlocks([line("transla-", 100), line("tion works", 112)]);
    expect(blocks[0].text).toBe("translation works");
  });
  it("büyük dikey boşluk yeni blok başlatır", () => {
    const blocks = groupIntoBlocks([line("paragraf bir", 100), line("paragraf iki", 160)]);
    expect(blocks).toHaveLength(2);
  });
  it("font boyutu sıçraması (başlık) yeni blok başlatır", () => {
    const blocks = groupIntoBlocks([line("BÜYÜK BAŞLIK", 100, 18), line("gövde metni burada", 122, 10)]);
    expect(blocks).toHaveLength(2);
  });
  it("yatay örtüşmeyen sütunlar ayrı blok olur", () => {
    const blocks = groupIntoBlocks([
      line("sol sütun metni", 100, 10, 10, 150),
      line("sağ sütun metni", 110, 10, 300, 150),
    ]);
    expect(blocks).toHaveLength(2);
  });
  it("yalnızca sayı bloğu translatable=false", () => {
    const blocks = groupIntoBlocks([line("42", 100)]);
    expect(blocks[0].translatable).toBe(false);
  });
});
