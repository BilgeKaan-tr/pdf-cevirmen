import { extractParagraphs, type OcrParagraph } from "./ocr";

type TessWorker = {
  recognize(image: HTMLCanvasElement, opts: object, output: object): Promise<{ data: unknown }>;
  terminate(): Promise<unknown>;
};

/**
 * Tesseract.js sarmalayıcı: worker yalnızca ilk ihtiyaçta (dinamik import)
 * oluşturulur ve sayfalar arasında yeniden kullanılır; dil değişince
 * yeniden başlatılır. WASM + dil verisi CDN'den gelir (SW önbelleğe alır).
 */
export class OcrManager {
  private worker: TessWorker | null = null;
  private lang = "";

  async recognize(canvas: HTMLCanvasElement, lang: string): Promise<OcrParagraph[]> {
    if (this.worker && this.lang !== lang) {
      await this.worker.terminate();
      this.worker = null;
    }
    if (!this.worker) {
      const { createWorker } = await import("tesseract.js");
      this.worker = (await createWorker(lang)) as unknown as TessWorker;
      this.lang = lang;
    }
    const { data } = await this.worker.recognize(canvas, {}, { blocks: true, text: true });
    return extractParagraphs(data);
  }

  async dispose(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }
}
