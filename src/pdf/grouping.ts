import type { RawItem, Line, Block } from "../types";
import { isTranslatable } from "../translate/filter";

export interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  fontName?: string;
}

export function toRawItems(items: PdfTextItem[], pageHeight: number): RawItem[] {
  const out: RawItem[] = [];
  for (const it of items) {
    if (!it.str || it.str.trim().length === 0) continue;
    const [, , c, d, e, f] = it.transform;
    const fontSize = Math.hypot(c, d) || 10;
    const h = it.height > 0 ? it.height : fontSize;
    out.push({
      text: it.str,
      x: e,
      y: pageHeight - f - h,
      width: it.width,
      height: h,
      fontSize,
      fontName: it.fontName ?? "",
    });
  }
  return out;
}

export function groupIntoLines(items: RawItem[]): Line[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const lines: Line[] = [];
  for (const it of sorted) {
    const last = lines[lines.length - 1];
    const sameLine =
      last && Math.abs(it.y - last.y) <= 0.3 * Math.max(it.fontSize, last.fontSize);
    if (sameLine) {
      const gap = it.x - (last.x + last.width);
      const sep = gap > 0.15 * last.fontSize ? " " : "";
      last.text += sep + it.text;
      const right = Math.max(last.x + last.width, it.x + it.width);
      last.x = Math.min(last.x, it.x);
      last.width = right - last.x;
      last.height = Math.max(last.height, it.height);
      last.fontSize = Math.max(last.fontSize, it.fontSize);
      last.bold = last.bold || /bold/i.test(it.fontName);
    } else {
      lines.push({
        text: it.text,
        x: it.x,
        y: it.y,
        width: it.width,
        height: it.height,
        fontSize: it.fontSize,
        bold: /bold/i.test(it.fontName),
      });
    }
  }
  return lines;
}

interface OpenBlock extends Block {
  lastLineY: number;
  lastLineH: number;
}

// Referans/kaynakça listeleri gibi sık satır aralıklı içerikler sınırsız
// büyürse hem çeviri isteklerini (Lingva URL sınırı, dev gövdeler) hem de
// çıktı yerleşimini bozar. Bir blok bu boyutu aşınca yeni blok başlatılır.
const MAX_BLOCK_CHARS = 2000;

export function groupIntoBlocks(lines: Line[]): Block[] {
  const blocks: OpenBlock[] = [];
  let cur: OpenBlock | null = null;
  for (const line of lines) {
    let merge = false;
    if (cur) {
      const overlap =
        Math.min(cur.x + cur.width, line.x + line.width) - Math.max(cur.x, line.x);
      const gapOk = line.y - cur.lastLineY < 1.6 * cur.lastLineH;
      const sizeOk = Math.abs(line.fontSize - cur.fontSize) < cur.fontSize * 0.2;
      const sizeCapOk = cur.text.length + 1 + line.text.length <= MAX_BLOCK_CHARS;
      merge = gapOk && overlap > 0 && sizeOk && sizeCapOk;
    }
    if (cur && merge) {
      cur.text = cur.text.endsWith("-")
        ? cur.text.slice(0, -1) + line.text
        : cur.text + " " + line.text;
      const right = Math.max(cur.x + cur.width, line.x + line.width);
      const bottom = Math.max(cur.y + cur.height, line.y + line.height);
      cur.x = Math.min(cur.x, line.x);
      cur.y = Math.min(cur.y, line.y);
      cur.width = right - cur.x;
      cur.height = bottom - cur.y;
      cur.bold = cur.bold && line.bold;
      cur.lastLineY = line.y;
      cur.lastLineH = line.height;
    } else {
      cur = {
        text: line.text,
        x: line.x,
        y: line.y,
        width: line.width,
        height: line.height,
        fontSize: line.fontSize,
        bold: line.bold,
        translatable: false,
        translated: null,
        failed: false,
        lastLineY: line.y,
        lastLineH: line.height,
      };
      blocks.push(cur);
    }
  }
  return blocks.map(({ lastLineY: _y, lastLineH: _h, ...b }) => ({
    ...b,
    translatable: isTranslatable(b.text),
  }));
}
