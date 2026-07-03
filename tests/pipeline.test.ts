import { describe, it, expect, vi } from "vitest";
import { runPipeline, type PageStage } from "../src/pipeline";
import type { RawItem } from "../src/types";

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
});
