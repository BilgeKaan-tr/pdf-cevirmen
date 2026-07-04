// Taranmış PDF simülasyonu: metin SVG→PNG'ye rasterize edilir (metin katmanı YOK).
// Kullanım: node scripts/make-scanned-sample.mjs
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { writeFileSync } from "node:fs";

const svg = (title, lines) => `
<svg xmlns="http://www.w3.org/2000/svg" width="1190" height="1684">
  <rect width="1190" height="1684" fill="#fdfdf8"/>
  <text x="120" y="220" font-family="Arial" font-size="56" font-weight="bold" fill="#111">${title}</text>
  ${lines.map((l, i) => `<text x="120" y="${340 + i * 54}" font-family="Arial" font-size="34" fill="#222">${l}</text>`).join("")}
  <rect x="120" y="900" width="400" height="240" fill="#3b82f6"/>
  <text x="120" y="1200" font-family="Arial" font-size="28" fill="#333">Figure 1: A solid blue rectangle</text>
</svg>`;

const page1 = await sharp(Buffer.from(svg("The Scanned Chapter", [
  "This page was rasterized to an image, so it has",
  "no text layer at all. The application must use",
  "optical character recognition to read this text",
  "before it can translate it into another language.",
]))).png().toBuffer();

const page2 = await sharp(Buffer.from(svg("Second Scanned Page", [
  "Older books are often digitized as photographs.",
  "Each page is just a picture of the original paper.",
  "Version two of this application can now handle",
  "these documents thanks to the built-in OCR engine.",
]))).png().toBuffer();

const doc = await PDFDocument.create();
for (const png of [page1, page2]) {
  const img = await doc.embedPng(png);
  const page = doc.addPage([595, 842]);
  page.drawImage(img, { x: 0, y: 0, width: 595, height: 842 });
}
writeFileSync(new URL("../public/ornek-taranmis.pdf", import.meta.url), await doc.save());
console.log("public/ornek-taranmis.pdf yazildi");
