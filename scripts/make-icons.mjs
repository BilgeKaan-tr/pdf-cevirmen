// PWA ikonlarını public/icon.svg'den üretir.
// Kullanım: node scripts/make-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const p = (rel) => fileURLToPath(new URL(rel, import.meta.url));

mkdirSync(p("../public/icons"), { recursive: true });
for (const size of [192, 512]) {
  await sharp(p("../public/icon.svg")).resize(size, size).png().toFile(p(`../public/icons/icon-${size}.png`));
}
await sharp(p("../public/icon.svg")).resize(512, 512).png().toFile(p("../public/icons/maskable-512.png"));
console.log("ikonlar üretildi");
