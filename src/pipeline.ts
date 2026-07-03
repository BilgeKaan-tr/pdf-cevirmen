import { groupIntoLines, groupIntoBlocks } from "./pdf/grouping";
import type { PageText } from "./pdf/extract";
import type { Block } from "./types";

export interface PageStage {
  extract(pageNum: number): Promise<PageText>;
  translate(texts: string[], signal?: AbortSignal): Promise<(string | null)[]>;
  renderMasked(
    pageNum: number,
    blocks: Block[]
  ): Promise<{ jpeg: Uint8Array; widthPt: number; heightPt: number }>;
  addPage(jpeg: Uint8Array, widthPt: number, heightPt: number, blocks: Block[]): Promise<void>;
}

export interface PipelineEvents {
  onPageDone?(done: number, total: number): void;
  onScannedPage?(pageNum: number): void;
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
  signal?: AbortSignal
): Promise<PipelineResult> {
  const result: PipelineResult = {
    translatedPages: 0,
    scannedPages: [],
    failedBlocks: 0,
    totalBlocks: 0,
  };
  let done = 0;
  for (const pageNum of pageNumbers) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    const pageText = await stage.extract(pageNum);
    const blocks = groupIntoBlocks(groupIntoLines(pageText.items));
    const translatableIdx = blocks
      .map((b, i) => (b.translatable ? i : -1))
      .filter((i) => i >= 0);

    if (pageText.scanned || translatableIdx.length === 0) {
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
      translatableIdx.forEach((bi, j) => {
        result.totalBlocks++;
        const t = translations[j];
        if (t) blocks[bi].translated = t;
        else {
          blocks[bi].failed = true;
          result.failedBlocks++;
        }
      });
      const r = await stage.renderMasked(pageNum, blocks);
      await stage.addPage(r.jpeg, r.widthPt, r.heightPt, blocks);
      result.translatedPages++;
    }
    done++;
    events.onPageDone?.(done, pageNumbers.length);
  }
  return result;
}
