import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { PdfPasswordError, type RawItem } from "../types";
import { toRawItems, type PdfTextItem } from "./grouping";

// Tarayıcıda worker gerekir; Node test ortamında yalnızca analyzePageText kullanılır.
if (typeof window !== "undefined") {
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
}

export interface PageText {
  items: RawItem[];
  width: number;
  height: number;
  scanned: boolean;
}

const SCANNED_THRESHOLD = 3; // bu sayıdan az metin öğesi = taranmış sayfa

export function analyzePageText(textItems: unknown[], width: number, height: number): PageText {
  const items = toRawItems(textItems as PdfTextItem[], height);
  return { items, width, height, scanned: items.length < SCANNED_THRESHOLD };
}

export async function loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy> {
  try {
    return await pdfjs.getDocument({ data }).promise;
  } catch (e) {
    if ((e as { name?: string })?.name === "PasswordException") throw new PdfPasswordError();
    throw e;
  }
}

export async function extractPageText(page: PDFPageProxy): Promise<PageText> {
  const viewport = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  return analyzePageText(content.items, viewport.width, viewport.height);
}
