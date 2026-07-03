import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { analyzePageText } from "../src/pdf/extract";

async function makeFixturePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello translated world", { x: 50, y: 700, size: 14, font });
  page.drawText("Second paragraph here", { x: 50, y: 650, size: 12, font });
  page.drawText("Third line of body text", { x: 50, y: 600, size: 12, font });
  return doc.save();
}

describe("analyzePageText (gerçek pdf.js ile)", () => {
  it("metni konumuyla çıkarır", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = await makeFixturePdf();
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const result = analyzePageText(content.items, viewport.width, viewport.height);
    expect(result.scanned).toBe(false);
    expect(result.width).toBe(600);
    expect(result.height).toBe(800);
    const all = result.items.map((i) => i.text).join(" ");
    expect(all).toContain("Hello");
    expect(all).toContain("Second");
    // y üstten ölçülür: y=700 taban çizgisi → üst kenar ~800-700-14 = 86 civarı
    expect(result.items[0].y).toBeGreaterThan(60);
    expect(result.items[0].y).toBeLessThan(110);
  });
  it("boş sayfayı taranmış sayar", () => {
    const result = analyzePageText([], 600, 800);
    expect(result.scanned).toBe(true);
  });
});
