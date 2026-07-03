import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { OutputPdfBuilder, sanitizeForFont } from "../src/pdf/build";
import type { Block } from "../src/types";

// 1x1 piksel geçerli JPEG
const TINY_JPEG = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=="
  ),
  (c) => c.charCodeAt(0)
);

const block = (over: Partial<Block> = {}): Block => ({
  text: "Hello world",
  x: 50, y: 100, width: 300, height: 40,
  fontSize: 12, bold: false, translatable: true,
  translated: "Merhaba dünya — çeviri şöyle görünür: ğüşıöçĞÜŞİÖÇ",
  failed: false,
  ...over,
});

describe("sanitizeForFont", () => {
  it("Türkçe karakterleri korur", () => {
    expect(sanitizeForFont("ğüşıöç ĞÜŞİÖÇ test")).toBe("ğüşıöç ĞÜŞİÖÇ test");
  });
  it("emojiyi temizler", () => {
    expect(sanitizeForFont("selam 👋 dünya")).toBe("selam  dünya");
  });
});

describe("OutputPdfBuilder", () => {
  it("çevirili sayfa üretir ve çıktı geçerli PDF olur", async () => {
    const regular = readFileSync("public/fonts/NotoSans-Regular.ttf");
    const bold = readFileSync("public/fonts/NotoSans-Bold.ttf");
    const builder = await OutputPdfBuilder.create(new Uint8Array(regular), new Uint8Array(bold));
    await builder.addPage(TINY_JPEG, 600, 800, [block(), block({ y: 200, bold: true })]);
    await builder.addPage(TINY_JPEG, 600, 800, []); // çevirisiz (taranmış) sayfa
    const bytes = await builder.save();
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(2);
    expect(reloaded.getPage(0).getWidth()).toBe(600);
  });
  it("translated=null blokları atlar", async () => {
    const regular = readFileSync("public/fonts/NotoSans-Regular.ttf");
    const bold = readFileSync("public/fonts/NotoSans-Bold.ttf");
    const builder = await OutputPdfBuilder.create(new Uint8Array(regular), new Uint8Array(bold));
    await builder.addPage(TINY_JPEG, 600, 800, [block({ translated: null, failed: true })]);
    const bytes = await builder.save();
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
