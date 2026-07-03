import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Block } from "../types";
import { fitText, type Measurer } from "../layout/fit";

const OVERFLOW_LIMIT = 1.1; // blok yüksekliğinin en fazla %110'una kadar çiz

// Noto Sans'ın kapsamadığı karakterleri temizle: Latin, Latin-1/Ek, Yunan,
// Kiril, Latin Extended Additional, genel noktalama, para birimleri, ™
export function sanitizeForFont(t: string): string {
  return t.replace(
    /[^\t -~ -ɏͰ-ϿЀ-ӿḀ-ỿ‐-‧‰-⁞₠-₿™]/g,
    ""
  );
}

export class OutputPdfBuilder {
  private constructor(
    private doc: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont
  ) {}

  static async create(regularBytes: Uint8Array, boldBytes: Uint8Array): Promise<OutputPdfBuilder> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const regular = await doc.embedFont(regularBytes, { subset: true });
    const bold = await doc.embedFont(boldBytes, { subset: true });
    return new OutputPdfBuilder(doc, regular, bold);
  }

  async addPage(jpeg: Uint8Array, widthPt: number, heightPt: number, blocks: Block[]): Promise<void> {
    const img = await this.doc.embedJpg(jpeg);
    const page = this.doc.addPage([widthPt, heightPt]);
    page.drawImage(img, { x: 0, y: 0, width: widthPt, height: heightPt });
    for (const b of blocks) {
      if (!b.translated) continue;
      const clean = sanitizeForFont(b.translated);
      if (clean.trim().length === 0) continue;
      const font = b.bold ? this.bold : this.regular;
      const m: Measurer = { width: (t, s) => font.widthOfTextAtSize(t, s) };
      const fit = fitText(clean, b.width, b.height, b.fontSize, m);
      fit.lines.forEach((line, i) => {
        const bottomOffset = fit.lineHeight * (i + 1);
        // %10 taşma sınırının ötesindeki satırları çizme (kırp)
        if (bottomOffset > b.height * OVERFLOW_LIMIT + fit.lineHeight * 0.01) return;
        page.drawText(line, {
          x: b.x,
          y: heightPt - (b.y + bottomOffset) + fit.size * 0.2,
          size: fit.size,
          font,
          color: rgb(0, 0, 0),
        });
      });
    }
  }

  async save(): Promise<Uint8Array> {
    return this.doc.save();
  }
}
