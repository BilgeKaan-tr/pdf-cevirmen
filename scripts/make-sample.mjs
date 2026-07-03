// Örnek test PDF'i üretir: başlık, paragraflar, grafik ögeleri, 2 sayfa.
// Kullanım: node scripts/make-sample.mjs
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync } from "node:fs";

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

const page1 = doc.addPage([595, 842]); // A4
page1.drawText("The History of Computing", { x: 60, y: 770, size: 24, font: bold });
page1.drawText("Chapter 1: Early Machines", { x: 60, y: 735, size: 14, font: bold });

const para1 = [
  "The first mechanical computers were designed in the nineteenth",
  "century. Charles Babbage proposed the Analytical Engine in 1837,",
  "a general-purpose machine that could be programmed with punched",
  "cards. Ada Lovelace wrote what is considered the first computer",
  "program for this machine, long before it was ever built.",
];
para1.forEach((line, i) => {
  page1.drawText(line, { x: 60, y: 700 - i * 16, size: 11, font });
});

// grafik: renkli kutu + daire (görsel korunma testi)
page1.drawRectangle({ x: 60, y: 480, width: 200, height: 120, color: rgb(0.2, 0.5, 0.9) });
page1.drawEllipse({ x: 350, y: 540, xScale: 60, yScale: 60, color: rgb(0.9, 0.4, 0.2) });
page1.drawText("Figure 1: Blue box and orange circle", { x: 60, y: 455, size: 9, font });

const para2 = [
  "Modern computers process billions of instructions per second.",
  "They rely on transistors, tiny switches etched into silicon,",
  "which replaced vacuum tubes during the 1950s and made machines",
  "smaller, faster and far more reliable than ever before.",
];
para2.forEach((line, i) => {
  page1.drawText(line, { x: 60, y: 420 - i * 16, size: 11, font });
});

const page2 = doc.addPage([595, 842]);
page2.drawText("Chapter 2: The Internet Era", { x: 60, y: 770, size: 14, font: bold });
const para3 = [
  "The internet connects billions of devices around the world.",
  "It began as a research project called ARPANET in 1969 and",
  "grew into a global network that changed how people work,",
  "learn and communicate with each other every single day.",
];
para3.forEach((line, i) => {
  page2.drawText(line, { x: 60, y: 740 - i * 16, size: 11, font });
});
page2.drawText("Visit https://example.com for more information.", { x: 60, y: 660, size: 10, font });
page2.drawText("42", { x: 500, y: 40, size: 10, font }); // sayfa numarası (çevrilmemeli)

const bytes = await doc.save();
writeFileSync(new URL("../public/ornek.pdf", import.meta.url), bytes);
console.log("public/ornek.pdf yazildi:", bytes.length, "bayt");
