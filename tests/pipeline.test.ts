import { describe, it, expect, vi } from "vitest";
import { runPipeline, type PageStage } from "../src/pipeline";
import { TranslationUnavailableError, type RawItem } from "../src/types";

const textItem = (text: string, y: number): RawItem =>
  ({ text, x: 10, y, width: 200, height: 10, fontSize: 10, fontName: "F" });

function fakeStage(pages: Record<number, RawItem[]>, translateImpl?: PageStage["translate"]): PageStage & { added: number[] } {
  const added: number[] = [];
  return {
    added,
    extract: async (n) => ({
      items: pages[n] ?? [],
      width: 600,
      height: 800,
      scanned: (pages[n] ?? []).length < 3,
    }),
    translate: translateImpl ?? (async (texts) => texts.map((t) => "ç:" + t)),
    renderMasked: async () => ({ jpeg: new Uint8Array([1]), widthPt: 600, heightPt: 800 }),
    addPage: async (_j, _w, _h, blocks) => { added.push(blocks.filter((b) => b.translated).length); },
  };
}

const threeItems = [
  textItem("Bir cümle burada.", 100),
  textItem("İkinci cümle burada.", 130),
  textItem("Üçüncü cümle burada.", 160),
];

describe("runPipeline", () => {
  it("normal sayfayı çevirir ve ilerleme bildirir", async () => {
    const stage = fakeStage({ 1: threeItems });
    const onPageDone = vi.fn();
    const result = await runPipeline([1], stage, { onPageDone });
    expect(result.translatedPages).toBe(1);
    expect(result.scannedPages).toEqual([]);
    expect(onPageDone).toHaveBeenCalledWith(1, 1);
    expect(stage.added[0]).toBeGreaterThan(0);
  });
  it("taranmış sayfayı çevirmeden kopyalar ve raporlar", async () => {
    const stage = fakeStage({ 1: [] });
    const onScannedPage = vi.fn();
    const result = await runPipeline([1], stage, { onScannedPage });
    expect(result.scannedPages).toEqual([1]);
    expect(onScannedPage).toHaveBeenCalledWith(1);
    expect(stage.added[0]).toBe(0);
  });
  it("başarısız blokları sayar", async () => {
    const stage = fakeStage({ 1: threeItems }, async (texts) => texts.map((_, i) => (i === 0 ? null : "ç")));
    const result = await runPipeline([1], stage);
    expect(result.failedBlocks).toBe(1);
    expect(result.totalBlocks).toBeGreaterThanOrEqual(2);
  });
  it("abort sinyalinde durur", async () => {
    const ac = new AbortController();
    ac.abort();
    const stage = fakeStage({ 1: threeItems });
    await expect(runPipeline([1], stage, {}, ac.signal)).rejects.toThrow();
  });
  it("3 sayfa üst üste hiç çevrilemezse TranslationUnavailableError fırlatır", async () => {
    const stage = fakeStage(
      { 1: threeItems, 2: threeItems, 3: threeItems, 4: threeItems },
      async (texts) => texts.map(() => null)
    );
    await expect(runPipeline([1, 2, 3, 4], stage)).rejects.toBeInstanceOf(TranslationUnavailableError);
    // ilk 3 sayfa yine de çıktıya eklendi (kısmî indirme mümkün)
    expect(stage.added.length).toBe(3);
  });
  it("taranmış sayfa OCR blok dönerse normal çeviri yoluna girer", async () => {
    const stage = fakeStage({ 1: [] }); // metin katmanı yok → scanned
    stage.ocr = async () => [{
      text: "Scanned title text", x: 50, y: 100, width: 300, height: 30,
      fontSize: 12, bold: false, translatable: true, translated: null, failed: false,
    }];
    const onOcrPage = vi.fn();
    const result = await runPipeline([1], stage, { onOcrPage });
    expect(onOcrPage).toHaveBeenCalledWith(1);
    expect(result.scannedPages).toEqual([]);
    expect(result.translatedPages).toBe(1);
    expect(stage.added[0]).toBe(1); // çevrilmiş 1 blok yerleşti
  });
  it("taranmış sayfada OCR boş dönerse v1 gibi kopyalanır", async () => {
    const stage = fakeStage({ 1: [] });
    stage.ocr = async () => [];
    const result = await runPipeline([1], stage);
    expect(result.scannedPages).toEqual([1]);
    expect(stage.added[0]).toBe(0);
  });
  it("figür modu: metin sayfasında örtüşmeyen OCR bloğu eklenir", async () => {
    const stage = fakeStage({ 1: threeItems });
    const seen: string[][] = [];
    const origTranslate = stage.translate;
    stage.translate = async (texts, sig) => { seen.push([...texts]); return origTranslate(texts, sig); };
    stage.ocr = async () => [{
      text: "Figure caption text", x: 400, y: 500, width: 150, height: 20,
      fontSize: 10, bold: false, translatable: true, translated: null, failed: false,
    }];
    const result = await runPipeline([1], stage, {}, undefined, { ocrFigures: true });
    expect(seen[0]).toContain("Figure caption text");
    expect(result.translatedPages).toBe(1);
  });
  it("figür modu kapalıyken metin sayfasında OCR çağrılmaz", async () => {
    const stage = fakeStage({ 1: threeItems });
    const ocr = vi.fn(async () => []);
    stage.ocr = ocr;
    await runPipeline([1], stage);
    expect(ocr).not.toHaveBeenCalled();
  });
  it("araya çevrilen sayfa girerse sayaç sıfırlanır, hata fırlamaz", async () => {
    let call = 0;
    const stage = fakeStage(
      { 1: threeItems, 2: threeItems, 3: threeItems, 4: threeItems },
      async (texts) => {
        call++;
        return texts.map(() => (call === 3 ? "ç" : null)); // 3. sayfa başarılı
      }
    );
    const result = await runPipeline([1, 2, 3, 4], stage);
    expect(result.translatedPages).toBe(4);
  });
});
