import { groupIntoLines, groupIntoBlocks } from "./pdf/grouping";
import type { PageText } from "./pdf/extract";
import { TranslationUnavailableError, type Block } from "./types";
import { filterNonOverlapping } from "./ocr/overlap";

// Üst üste bu kadar sayfa hiç çevrilemezse servis erişilemez kabul edilir;
// yüzlerce sayfayı sessizce çevirisiz kopyalamak yerine işlem durdurulur
// (o ana kadarki sayfalar kısmî çıktı olarak indirilebilir).
const MAX_CONSECUTIVE_FAILED_PAGES = 3;

export interface PageStage {
  extract(pageNum: number): Promise<PageText>;
  translate(texts: string[], signal?: AbortSignal): Promise<(string | null)[]>;
  renderMasked(
    pageNum: number,
    blocks: Block[]
  ): Promise<{ jpeg: Uint8Array; widthPt: number; heightPt: number }>;
  addPage(jpeg: Uint8Array, widthPt: number, heightPt: number, blocks: Block[]): Promise<void>;
  /** Sayfayı görselden okur; paragrafları Block olarak döndürür. Yoksa OCR devre dışı. */
  ocr?(pageNum: number): Promise<Block[]>;
}

export interface PipelineEvents {
  onPageDone?(done: number, total: number): void;
  onScannedPage?(pageNum: number): void;
  onOcrPage?(pageNum: number): void;
}

export interface PipelineOpts {
  /** Metin katmanlı sayfalarda da figür/resim yazılarını OCR'la. */
  ocrFigures?: boolean;
}

export interface PipelineResult {
  translatedPages: number;
  scannedPages: number[];
  failedBlocks: number;
  totalBlocks: number;
}

export async function runPipeline(
  pageNumbers: number[],
  stage: PageStage,
  events: PipelineEvents = {},
  signal?: AbortSignal,
  opts: PipelineOpts = {}
): Promise<PipelineResult> {
  const result: PipelineResult = {
    translatedPages: 0,
    scannedPages: [],
    failedBlocks: 0,
    totalBlocks: 0,
  };
  let done = 0;
  let consecutiveFailed = 0;
  for (const pageNum of pageNumbers) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const pageText = await stage.extract(pageNum);
    let blocks = groupIntoBlocks(groupIntoLines(pageText.items));
    let ocrProvided = false;
    if (pageText.scanned && stage.ocr) {
      events.onOcrPage?.(pageNum);
      const ocrBlocks = await stage.ocr(pageNum);
      if (ocrBlocks.length > 0) {
        blocks = ocrBlocks;
        ocrProvided = true;
      }
    } else if (!pageText.scanned && opts.ocrFigures && stage.ocr) {
      events.onOcrPage?.(pageNum);
      const ocrBlocks = await stage.ocr(pageNum);
      blocks = blocks.concat(filterNonOverlapping(ocrBlocks, blocks));
    }
    const translatableIdx = blocks
      .map((b, i) => (b.translatable ? i : -1))
      .filter((i) => i >= 0);

    if ((pageText.scanned && !ocrProvided) || translatableIdx.length === 0) {
      if (pageText.scanned) {
        result.scannedPages.push(pageNum);
        events.onScannedPage?.(pageNum);
      }
      const r = await stage.renderMasked(pageNum, []);
      await stage.addPage(r.jpeg, r.widthPt, r.heightPt, []);
    } else {
      const translations = await stage.translate(
        translatableIdx.map((i) => blocks[i].text),
        signal
      );
      let okOnPage = 0;
      translatableIdx.forEach((bi, j) => {
        result.totalBlocks++;
        const t = translations[j];
        if (t) {
          blocks[bi].translated = t;
          okOnPage++;
        } else {
          blocks[bi].failed = true;
          result.failedBlocks++;
        }
      });
      const r = await stage.renderMasked(pageNum, blocks);
      await stage.addPage(r.jpeg, r.widthPt, r.heightPt, blocks);
      result.translatedPages++;
      if (okOnPage === 0) consecutiveFailed++;
      else consecutiveFailed = 0;
    }
    done++;
    events.onPageDone?.(done, pageNumbers.length);
    if (consecutiveFailed >= MAX_CONSECUTIVE_FAILED_PAGES) {
      throw new TranslationUnavailableError();
    }
  }
  return result;
}
