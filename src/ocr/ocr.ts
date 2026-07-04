import type { Block } from "../types";
import { isTranslatable } from "../translate/filter";

export interface TessBbox { x0: number; y0: number; x1: number; y1: number }

export interface OcrParagraph {
  text: string;
  bbox: TessBbox;
  confidence: number;
  lineCount: number;
}

const MIN_OCR_CONFIDENCE = 60;

const OCR_LANGS: Record<string, string> = {
  en: "eng", de: "deu", fr: "fra", es: "spa", it: "ita", pt: "por",
  nl: "nld", ru: "rus", uk: "ukr", pl: "pol", ar: "ara", fa: "fas",
  "zh-CN": "chi_sim", ja: "jpn", ko: "kor", hi: "hin", el: "ell",
  sv: "swe", tr: "tur",
};

export function getOcrLang(sourceCode: string): string {
  return OCR_LANGS[sourceCode] ?? "eng";
}

interface TessParagraph {
  text?: string;
  confidence?: number;
  bbox?: TessBbox;
  lines?: unknown[];
}

/** Tesseract v4 (data.paragraphs) ve v5+ (data.blocks[].paragraphs) çıktısını normalleştirir. */
export function extractParagraphs(data: unknown): OcrParagraph[] {
  const d = data as { paragraphs?: TessParagraph[]; blocks?: Array<{ paragraphs?: TessParagraph[] }> };
  const paras = d.paragraphs ?? (d.blocks ?? []).flatMap((b) => b.paragraphs ?? []);
  const out: OcrParagraph[] = [];
  for (const p of paras) {
    if (!p.bbox) continue;
    const text = (p.text ?? "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    out.push({ text, bbox: p.bbox, confidence: p.confidence ?? 0, lineCount: p.lines?.length || 1 });
  }
  return out;
}

/** OCR paragraflarını (canvas pikseli) mevcut Block tipine (PDF puntosu) çevirir. */
export function ocrParagraphsToBlocks(paras: OcrParagraph[], scale: number): Block[] {
  const blocks: Block[] = [];
  for (const p of paras) {
    if (p.confidence < MIN_OCR_CONFIDENCE) continue;
    if (!isTranslatable(p.text)) continue;
    const x = p.bbox.x0 / scale;
    const y = p.bbox.y0 / scale;
    const width = (p.bbox.x1 - p.bbox.x0) / scale;
    const height = (p.bbox.y1 - p.bbox.y0) / scale;
    if (width <= 0 || height <= 0) continue;
    blocks.push({
      text: p.text,
      x, y, width, height,
      fontSize: Math.max(6, (height / Math.max(1, p.lineCount)) * 0.75),
      bold: false,
      translatable: true,
      translated: null,
      failed: false,
    });
  }
  return blocks;
}
