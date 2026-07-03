# PDF Çevirmen v1 — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tamamen tarayıcıda çalışan, düzen korumalı, ücretsiz PDF çeviri web uygulaması (varsayılan motor: anahtarsız Google gtx; isteğe bağlı: Gemini BYOK; yedek: Lingva).

**Architecture:** Statik Vite + TypeScript SPA. pdf.js metni konumuyla çıkarır; kendi modüllerimiz satır→blok gruplar; çeviri motor soyutlamasıyla toplu çevrilir; sayfa canvas'a çizilip metin blokları arka plan rengiyle maskelenir; pdf-lib çıktı PDF'ine sayfa görüntüsünü ve çeviriyi gerçek metin olarak gömer.

**Tech Stack:** Vite 6, TypeScript 5 (strict), Vitest 2, pdfjs-dist 4, pdf-lib 1.17, @pdf-lib/fontkit, Noto Sans (OFL).

**Spec:** `docs/superpowers/specs/2026-07-03-pdf-cevirmen-design.md`

## Global Constraints

- Sunucu tarafı bileşen YOK; her şey istemcide. PDF hiçbir yere yüklenmez.
- Tüm arayüz metinleri Türkçe ve YALNIZCA `src/strings.ts` içinde tanımlı.
- Parça (chunk) boyutu: istek başına ≤ **4500** karakter; bloklar `\n` ile birleştirilir.
- Eşzamanlılık: Google **6**, Lingva **3** paralel istek. Yeniden deneme gecikmeleri Google/genel: **[1000, 2000, 4000] ms**, Lingva: **[1000, 2000] ms**, Gemini: **[2000, 5000] ms**.
- Gemini: model `gemini-flash-latest`, istekler arası min **4500 ms**, grup ≤ **8000** karakter, işaretleyici `⟦N⟧`, anahtar localStorage `pdf-cevirmen.gemini-key`.
- Render ölçeği: `min(2, 3000 / uzunKenarPt)`; çıktı JPEG kalite **0.85**; önizleme genişliği ≤ **900 px**.
- Yazı sığdırma: satır aralığı **1.25**, taban boyut **6 pt**, adım **0.5 pt**, blok taşma tavanı **%10** (ötesi çizilmez).
- Taranmış sayfa eşiği: sayfada **< 3** metin öğesi.
- TypeScript `strict: true`; `npm run build` = `tsc --noEmit && vite build`; Vite `base: "./"`.
- Lisans MIT; adda/markada "Google"/"Gemini" ticari marka olarak kullanılmaz.
- Her görev sonunda commit; commit mesajları İngilizce `feat:/test:/chore:` önekli, gövdesiz tek satır + `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Çalışma dizini: `C:\Users\Pc\Desktop\claude code\pdf-cevirmen` (yol boşluk içerir — komutlarda tırnak kullan). Kabuk: PowerShell 5.1 (`&&` YOK; komutları `;` ile zincirle).

## Dosya Yapısı

```
pdf-cevirmen/
├── index.html                  # tek sayfa; tüm ekranlar (Task 14)
├── styles.css                  # sade stiller (Task 14)
├── package.json, tsconfig.json, vite.config.ts, .gitignore, LICENSE (Task 1)
├── public/fonts/NotoSans-Regular.ttf, NotoSans-Bold.ttf (Task 1)
├── src/
│   ├── types.ts                # ortak tipler + hata sınıfları (Task 1)
│   ├── strings.ts              # tüm TR metinler + dil listeleri (Task 1)
│   ├── util.ts                 # mapPool, withRetry (Task 6)
│   ├── translate/
│   │   ├── filter.ts           # isTranslatable (Task 2)
│   │   ├── chunking.ts         # makeChunks, splitTranslated (Task 3)
│   │   ├── batch.ts            # runBatch ortak toplu çeviri kalıbı (Task 7)
│   │   ├── google.ts           # GoogleGtxEngine + parseGtxResponse (Task 7)
│   │   ├── lingva.ts           # LingvaEngine (Task 8)
│   │   ├── orchestrator.ts     # motor sırası + yedek zincir (Task 8)
│   │   ├── gemini.ts           # GeminiEngine + prompt/parse (Task 9)
│   │   └── settings.ts         # Gemini anahtarı localStorage (Task 9)
│   ├── pdf/
│   │   ├── grouping.ts         # toRawItems, groupIntoLines, groupIntoBlocks (Task 4)
│   │   ├── extract.ts          # pdf.js sarmalayıcı + analyzePageText (Task 10)
│   │   ├── render.ts           # computeScale, sampleBackground, mask, jpeg (Task 11)
│   │   └── build.ts            # OutputPdfBuilder, sanitizeForFont (Task 12)
│   ├── layout/fit.ts           # wrapText, fitText (Task 5)
│   ├── pipeline.ts             # sayfa döngüsü koordinatörü (Task 13)
│   └── main.ts                 # UI bağlama (Task 14)
├── tests/                      # vitest birim testleri (görev başına)
└── .github/workflows/deploy.yml (Task 15)
```

---

### Task 1: Proje iskeleti

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `LICENSE`, `index.html` (geçici kabuk), `src/types.ts`, `src/strings.ts`, `tests/smoke.test.ts`, `public/fonts/NotoSans-Regular.ttf`, `public/fonts/NotoSans-Bold.ttf`

**Interfaces:**
- Produces: `src/types.ts` içindeki tüm tipler (aşağıda tam kod — sonraki tüm görevler bunları import eder), `src/strings.ts` içindeki `STR`, `SOURCE_LANGS`, `TARGET_LANGS`.

- [ ] **Step 1: Dosyaları oluştur**

`package.json`:
```json
{
  "name": "pdf-cevirmen",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: { target: "es2022" },
});
```

`.gitignore`:
```
node_modules/
dist/
```

`LICENSE`: standart MIT metni, satır 3: `Copyright (c) 2026 pdf-cevirmen contributors`

`index.html` (geçici kabuk; Task 14'te tam sürümüyle değiştirilecek):
```html
<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PDF Çevirmen</title>
</head>
<body>
  <div id="app">PDF Çevirmen — yapım aşamasında</div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

`src/main.ts` (geçici): `console.log("pdf-cevirmen");`

`src/types.ts` (TAM içerik — sonraki görevler buna güvenir):
```ts
export interface RawItem {
  text: string;
  x: number;       // PDF punto, sol kenardan
  y: number;       // PDF punto, sayfanın ÜSTÜNDEN ölçülen üst kenar
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
}

export interface Line {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
}

export interface Block {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
  translatable: boolean;
  translated: string | null;
  failed: boolean;
}

export type EngineId = "google" | "lingva" | "gemini";

export interface TranslationEngine {
  readonly id: EngineId;
  translateBatch(
    texts: string[],
    source: string,
    target: string,
    signal?: AbortSignal
  ): Promise<(string | null)[]>;
}

export class PdfPasswordError extends Error {
  constructor() { super("password"); this.name = "PdfPasswordError"; }
}

export class GeminiQuotaError extends Error {
  constructor() { super("gemini quota"); this.name = "GeminiQuotaError"; }
}
```

`src/strings.ts` (TAM içerik):
```ts
export const STR = {
  appName: "PDF Çevirmen",
  tagline: "Ücretsiz, sınırsız, kurulumsuz PDF çevirisi — dosyanız bilgisayarınızdan çıkmaz.",
  dropHint: "PDF dosyasını buraya sürükleyin ya da tıklayıp seçin",
  privacy:
    "Gizlilik: PDF dosyanız hiçbir sunucuya yüklenmez; tüm işlem tarayıcınızda yapılır. " +
    "Yalnızca çevrilecek metin parçaları seçtiğiniz çeviri servisine (Google/Lingva/Gemini) gönderilir.",
  sourceLang: "Kaynak dil",
  targetLang: "Hedef dil",
  auto: "Otomatik algıla",
  settings: "Ayarlar",
  geminiKeyLabel: "Gemini API anahtarı (isteğe bağlı — daha kaliteli çeviri)",
  geminiKeyHint:
    "Google AI Studio'dan ücretsiz alınır. Anahtar yalnızca bu tarayıcıda saklanır, " +
    "yalnızca Google'ın resmî API'sine gönderilir.",
  pageRange: "Sayfa aralığı",
  pageRangeAll: "Tümü",
  start: "Çeviriyi Başlat",
  cancel: "İptal",
  download: "Çevrilmiş PDF'i İndir",
  compare: "Orijinalle karşılaştır",
  progress: (done: number, total: number) => `Sayfa ${done}/${total} çevrildi`,
  preparing: "PDF okunuyor…",
  buildingPdf: "Çıktı PDF'i oluşturuluyor…",
  doneMsg: "Çeviri tamamlandı.",
  cancelled: "Çeviri iptal edildi. O ana kadar biten sayfaları indirebilirsiniz.",
  errPassword: "Bu PDF parola korumalı. Lütfen parolasız bir kopya kullanın.",
  errBroken: "Dosya açılamadı. PDF bozuk ya da desteklenmeyen bir biçimde olabilir.",
  errNotPdf: "Lütfen bir PDF dosyası seçin.",
  errScannedAll:
    "Bu PDF taranmış görüntülerden oluşuyor (metin katmanı yok). " +
    "Sürüm 1 OCR desteklemiyor; metin tabanlı bir PDF deneyin.",
  warnScannedSome: (n: number) =>
    `${n} sayfa taranmış görüntü olduğu için çevrilemedi; bu sayfalar olduğu gibi kopyalandı.`,
  warnFailedBlocks: (n: number) =>
    `${n} metin bloğu çevrilemedi ve orijinal haliyle bırakıldı.`,
  warnBigFile:
    "Bu PDF çok büyük (300+ sayfa). Tamamını çevirebilirsiniz ama sayfa aralığı seçmek daha hızlı olur.",
  geminiQuota:
    "Gemini ücretsiz kotası doldu. Google motoruyla devam edilsin mi?",
  engineGoogle: "Hızlı motor (anahtarsız)",
  engineGemini: "Kaliteli motor (Gemini anahtarınız kayıtlı)",
  netPaused: "Bağlantı sorunu. Tekrar denemek için düğmeye basın.",
  retry: "Yeniden dene",
} as const;

// Kaynak diller: otomatik + yaygın diller (her alfabe kaynak olabilir)
export const SOURCE_LANGS: [string, string][] = [
  ["auto", "Otomatik algıla"], ["en", "İngilizce"], ["de", "Almanca"],
  ["fr", "Fransızca"], ["es", "İspanyolca"], ["it", "İtalyanca"],
  ["pt", "Portekizce"], ["nl", "Felemenkçe"], ["ru", "Rusça"],
  ["uk", "Ukraynaca"], ["pl", "Lehçe"], ["ar", "Arapça"], ["fa", "Farsça"],
  ["zh-CN", "Çince"], ["ja", "Japonca"], ["ko", "Korece"], ["hi", "Hintçe"],
  ["el", "Yunanca"], ["sv", "İsveççe"], ["tr", "Türkçe"],
];

// Hedef diller: v1'de Noto Sans'ın kapsadığı Latin/Kiril/Yunan alfabeli diller
export const TARGET_LANGS: [string, string][] = [
  ["tr", "Türkçe"], ["en", "İngilizce"], ["de", "Almanca"], ["fr", "Fransızca"],
  ["es", "İspanyolca"], ["it", "İtalyanca"], ["pt", "Portekizce"],
  ["nl", "Felemenkçe"], ["sv", "İsveççe"], ["no", "Norveççe"], ["da", "Danca"],
  ["fi", "Fince"], ["pl", "Lehçe"], ["cs", "Çekçe"], ["sk", "Slovakça"],
  ["hu", "Macarca"], ["ro", "Romence"], ["bg", "Bulgarca"], ["el", "Yunanca"],
  ["ru", "Rusça"], ["uk", "Ukraynaca"], ["sr", "Sırpça"], ["hr", "Hırvatça"],
  ["bs", "Boşnakça"], ["sq", "Arnavutça"], ["az", "Azerbaycan dili"],
  ["id", "Endonezce"], ["ms", "Malayca"], ["vi", "Vietnamca"], ["et", "Estonca"],
  ["lv", "Letonca"], ["lt", "Litvanca"],
];
```

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { STR, SOURCE_LANGS, TARGET_LANGS } from "../src/strings";

describe("iskelet", () => {
  it("stringler yüklü", () => {
    expect(STR.appName).toBe("PDF Çevirmen");
    expect(SOURCE_LANGS[0][0]).toBe("auto");
    expect(TARGET_LANGS[0][0]).toBe("tr");
  });
});
```

- [ ] **Step 2: Bağımlılıkları kur**

Run (PowerShell, proje kökünde):
```powershell
npm install pdf-lib@^1.17.1 pdfjs-dist@^4.8.69 "@pdf-lib/fontkit@^1.1.1"
npm install -D typescript@^5.6.0 vite@^6.0.0 vitest@^2.1.0
```
Expected: `added ... packages` — hata yok.

- [ ] **Step 3: Fontları indir**

Run:
```powershell
New-Item -ItemType Directory -Force public\fonts | Out-Null
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf" -OutFile "public\fonts\NotoSans-Regular.ttf"
Invoke-WebRequest -Uri "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts/NotoSans/hinted/ttf/NotoSans-Bold.ttf" -OutFile "public\fonts\NotoSans-Bold.ttf"
(Get-Item "public\fonts\NotoSans-Regular.ttf").Length
```
Expected: her iki dosya da > 300000 bayt. URL 404 verirse yedek kaynak: `https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/main/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf` (ve `-Bold.ttf`). O da olmazsa `https://fonts.google.com/download?family=Noto+Sans` zip'inden statik TTF'ler alınır. İndirilemiyorsa DUR ve raporla — fontlar 12. görev için zorunlu.

- [ ] **Step 4: Testi ve build'i doğrula**

Run: `npm test` → Expected: `1 passed`.
Run: `npm run build` → Expected: `dist/` oluşur, hata yok.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "chore: scaffold Vite+TS project with types, strings, fonts

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Çevrilebilir blok filtresi

**Files:**
- Create: `src/translate/filter.ts`
- Test: `tests/filter.test.ts`

**Interfaces:**
- Produces: `isTranslatable(text: string): boolean`

- [ ] **Step 1: Başarısız testi yaz**

`tests/filter.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isTranslatable } from "../src/translate/filter";

describe("isTranslatable", () => {
  it("normal cümle çevrilir", () => {
    expect(isTranslatable("The quick brown fox jumps.")).toBe(true);
  });
  it("tek harf/boş çevrilmez", () => {
    expect(isTranslatable("a")).toBe(false);
    expect(isTranslatable("   ")).toBe(false);
  });
  it("yalnızca sayı/noktalama çevrilmez", () => {
    expect(isTranslatable("42")).toBe(false);
    expect(isTranslatable("3.14 - 2,718")).toBe(false);
    expect(isTranslatable("• § 12.3 (a)")).toBe(false);
  });
  it("URL ve e-posta çevrilmez", () => {
    expect(isTranslatable("https://example.com/page?x=1")).toBe(false);
    expect(isTranslatable("www.example.com")).toBe(false);
    expect(isTranslatable("kisi@example.com")).toBe(false);
  });
  it("sayı içeren gerçek cümle çevrilir", () => {
    expect(isTranslatable("Chapter 3 covers 42 topics.")).toBe(true);
  });
});
```

- [ ] **Step 2: Testin başarısız olduğunu gör**

Run: `npx vitest run tests/filter.test.ts`
Expected: FAIL — "Cannot find module .../filter".

- [ ] **Step 3: Uygula**

`src/translate/filter.ts`:
```ts
export function isTranslatable(text: string): boolean {
  const t = text.trim();
  if (t.length < 2) return false;
  if (/^[\d\s\p{P}\p{S}]+$/u.test(t)) return false;
  if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return false;
  return true;
}
```

- [ ] **Step 4: Testin geçtiğini gör**

Run: `npx vitest run tests/filter.test.ts` → Expected: 5 passed.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add translatable-block filter

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Parçalama (chunking)

**Files:**
- Create: `src/translate/chunking.ts`
- Test: `tests/chunking.test.ts`

**Interfaces:**
- Produces: `interface Chunk { indices: number[]; text: string }`, `makeChunks(texts: string[], maxChars?: number): Chunk[]`, `splitTranslated(chunk: Chunk, translated: string): string[] | null`

- [ ] **Step 1: Başarısız testi yaz**

`tests/chunking.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { makeChunks, splitTranslated } from "../src/translate/chunking";

describe("makeChunks", () => {
  it("sınıra kadar paketler", () => {
    const chunks = makeChunks(["aaaa", "bbbb", "cccc"], 9);
    // "aaaa\nbbbb" = 9 karakter sığar; "cccc" yeni parça
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toEqual({ indices: [0, 1], text: "aaaa\nbbbb" });
    expect(chunks[1]).toEqual({ indices: [2], text: "cccc" });
  });
  it("tek büyük blok kendi parçasını alır", () => {
    const chunks = makeChunks(["x".repeat(50), "kısa"], 10);
    expect(chunks.length).toBe(2);
    expect(chunks[0].indices).toEqual([0]);
  });
  it("blok içi satır sonlarını boşluğa çevirir", () => {
    const chunks = makeChunks(["ab\ncd"], 100);
    expect(chunks[0].text).toBe("ab cd");
  });
});

describe("splitTranslated", () => {
  const chunk = { indices: [3, 7, 9], text: "a\nb\nc" };
  it("tam eşleşme", () => {
    expect(splitTranslated(chunk, "çeviri1\nçeviri2\nçeviri3"))
      .toEqual(["çeviri1", "çeviri2", "çeviri3"]);
  });
  it("fazladan boş satırları temizleyip eşleştirir", () => {
    expect(splitTranslated(chunk, "ç1\n\nç2\n\nç3\n"))
      .toEqual(["ç1", "ç2", "ç3"]);
  });
  it("uyuşmazlıkta null döner", () => {
    expect(splitTranslated(chunk, "hepsi tek satırda birleşti")).toBeNull();
  });
});
```

- [ ] **Step 2: Başarısızlığı gör** — Run: `npx vitest run tests/chunking.test.ts` → FAIL (modül yok).

- [ ] **Step 3: Uygula**

`src/translate/chunking.ts`:
```ts
export interface Chunk {
  indices: number[];
  text: string;
}

export function makeChunks(texts: string[], maxChars = 4500): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;
  texts.forEach((t, i) => {
    const clean = t.replace(/\s*\n\s*/g, " ").trim();
    if (cur && cur.text.length + 1 + clean.length <= maxChars) {
      cur.indices.push(i);
      cur.text += "\n" + clean;
    } else {
      cur = { indices: [i], text: clean };
      chunks.push(cur);
    }
  });
  return chunks;
}

export function splitTranslated(chunk: Chunk, translated: string): string[] | null {
  const n = chunk.indices.length;
  let parts = translated.split("\n").map((p) => p.trim());
  if (parts.length !== n) parts = parts.filter((p) => p.length > 0);
  return parts.length === n ? parts : null;
}
```

- [ ] **Step 4: Geçtiğini gör** — Run: `npx vitest run tests/chunking.test.ts` → 6 passed.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add translation chunking with mismatch detection

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Satır ve blok gruplama

**Files:**
- Create: `src/pdf/grouping.ts`
- Test: `tests/grouping.test.ts`

**Interfaces:**
- Consumes: `RawItem`, `Line`, `Block` (types.ts), `isTranslatable` (Task 2)
- Produces: `toRawItems(items: PdfTextItem[], pageHeight: number): RawItem[]`, `groupIntoLines(items: RawItem[]): Line[]`, `groupIntoBlocks(lines: Line[]): Block[]`, `interface PdfTextItem { str: string; transform: number[]; width: number; height: number; fontName?: string }`

- [ ] **Step 1: Başarısız testi yaz**

`tests/grouping.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { toRawItems, groupIntoLines, groupIntoBlocks } from "../src/pdf/grouping";
import type { RawItem } from "../src/types";

// yardımcı: basit RawItem üret
function item(text: string, x: number, y: number, w: number, fs = 10, fontName = "F1"): RawItem {
  return { text, x, y, width: w, height: fs, fontSize: fs, fontName };
}

describe("toRawItems", () => {
  it("pdf.js öğesini üstten-y koordinatına çevirir", () => {
    // pageHeight=800, taban çizgisi f=700, yükseklik 12 → üst kenar y = 800-700-12 = 88
    const out = toRawItems(
      [{ str: "Merhaba", transform: [12, 0, 0, 12, 50, 700], width: 40, height: 12, fontName: "F1" }],
      800
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ text: "Merhaba", x: 50, y: 88, fontSize: 12 });
  });
  it("boş öğeleri atar", () => {
    expect(toRawItems([{ str: "  ", transform: [10, 0, 0, 10, 0, 0], width: 5, height: 10 }], 800)).toHaveLength(0);
  });
});

describe("groupIntoLines", () => {
  it("aynı taban çizgisindeki öğeleri boşlukla birleştirir", () => {
    const lines = groupIntoLines([item("Hello", 10, 100, 30), item("world", 45, 100.5, 30)]);
    expect(lines).toHaveLength(1);
    expect(lines[0].text).toBe("Hello world");
    expect(lines[0].width).toBeCloseTo(65, 0);
  });
  it("bitişik öğeleri boşluksuz birleştirir", () => {
    const lines = groupIntoLines([item("Mer", 10, 100, 20), item("haba", 30.5, 100, 25)]);
    expect(lines[0].text).toBe("Merhaba");
  });
  it("farklı y'deki öğeler ayrı satır olur", () => {
    const lines = groupIntoLines([item("üst", 10, 100, 20), item("alt", 10, 130, 20)]);
    expect(lines).toHaveLength(2);
  });
});

describe("groupIntoBlocks", () => {
  const line = (text: string, y: number, fs = 10, x = 10, w = 200) =>
    ({ text, x, y, width: w, height: fs, fontSize: fs, bold: false });
  it("yakın satırlar tek blok olur, metin akar", () => {
    const blocks = groupIntoBlocks([line("Birinci satır", 100), line("ikinci satır.", 112)]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].text).toBe("Birinci satır ikinci satır.");
    expect(blocks[0].translatable).toBe(true);
  });
  it("tire ile bölünen kelime birleşir", () => {
    const blocks = groupIntoBlocks([line("transla-", 100), line("tion works", 112)]);
    expect(blocks[0].text).toBe("translation works");
  });
  it("büyük dikey boşluk yeni blok başlatır", () => {
    const blocks = groupIntoBlocks([line("paragraf bir", 100), line("paragraf iki", 160)]);
    expect(blocks).toHaveLength(2);
  });
  it("font boyutu sıçraması (başlık) yeni blok başlatır", () => {
    const blocks = groupIntoBlocks([line("BÜYÜK BAŞLIK", 100, 18), line("gövde metni burada", 122, 10)]);
    expect(blocks).toHaveLength(2);
  });
  it("yatay örtüşmeyen sütunlar ayrı blok olur", () => {
    const blocks = groupIntoBlocks([
      line("sol sütun metni", 100, 10, 10, 150),
      line("sağ sütun metni", 110, 10, 300, 150),
    ]);
    expect(blocks).toHaveLength(2);
  });
  it("yalnızca sayı bloğu translatable=false", () => {
    const blocks = groupIntoBlocks([line("42", 100)]);
    expect(blocks[0].translatable).toBe(false);
  });
});
```

- [ ] **Step 2: Başarısızlığı gör** — Run: `npx vitest run tests/grouping.test.ts` → FAIL (modül yok).

- [ ] **Step 3: Uygula**

`src/pdf/grouping.ts`:
```ts
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
      merge = gapOk && overlap > 0 && sizeOk;
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
```

- [ ] **Step 4: Geçtiğini gör** — Run: `npx vitest run tests/grouping.test.ts` → 12 passed.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add line/block grouping from PDF text items

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Kutuya sığdırma (fit)

**Files:**
- Create: `src/layout/fit.ts`
- Test: `tests/fit.test.ts`

**Interfaces:**
- Produces: `interface Measurer { width(text: string, size: number): number }`, `interface FitResult { size: number; lines: string[]; lineHeight: number }`, `wrapText(text, size, maxWidth, m): string[]`, `fitText(text, boxWidth, boxHeight, startSize, m, minSize?): FitResult`

- [ ] **Step 1: Başarısız testi yaz**

`tests/fit.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { wrapText, fitText, type Measurer } from "../src/layout/fit";

// deterministik ölçer: genişlik = karakter sayısı * boyut * 0.5
const m: Measurer = { width: (t, s) => t.length * s * 0.5 };

describe("wrapText", () => {
  it("kelimeleri satıra sarar", () => {
    // boyut 10 → karakter genişliği 5; maxWidth 50 → satır başına 10 karakter
    expect(wrapText("aaa bbb ccc ddd", 10, 50, m)).toEqual(["aaa bbb", "ccc ddd"]);
  });
  it("kutudan geniş tek kelimeyi karakterden böler", () => {
    const lines = wrapText("abcdefghijklmnop", 10, 25, m); // satır başına 5 karakter
    expect(lines.every((l) => m.width(l, 10) <= 25)).toBe(true);
    expect(lines.join("")).toBe("abcdefghijklmnop");
  });
});

describe("fitText", () => {
  it("sığıyorsa başlangıç boyutunu korur", () => {
    const fit = fitText("kısa", 100, 20, 10, m);
    expect(fit.size).toBe(10);
    expect(fit.lines).toEqual(["kısa"]);
  });
  it("sığmayınca boyutu küçültür", () => {
    // 40 karakter, boyut 10'da genişlik 200 > kutu 100 → sarma/küçültme gerekir
    const fit = fitText("a".repeat(40), 100, 14, 10, m);
    expect(fit.size).toBeLessThan(10);
    const lineH = fit.size * 1.25;
    expect(fit.lines.length * lineH).toBeLessThanOrEqual(14 * 1.02 + 1e6 * 0); // kutuya sığar
  });
  it("taban 6pt'nin altına inmez", () => {
    const fit = fitText("çok ".repeat(200), 50, 10, 12, m);
    expect(fit.size).toBe(6);
    expect(fit.lines.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Başarısızlığı gör** — Run: `npx vitest run tests/fit.test.ts` → FAIL.

- [ ] **Step 3: Uygula**

`src/layout/fit.ts`:
```ts
export interface Measurer {
  width(text: string, size: number): number;
}

export interface FitResult {
  size: number;
  lines: string[];
  lineHeight: number;
}

const LINE_SPACING = 1.25;
const MIN_SIZE = 6;

export function wrapText(text: string, size: number, maxWidth: number, m: Measurer): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let cur = "";
  for (let word of words) {
    while (m.width(word, size) > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && m.width(word.slice(0, cut), size) > maxWidth) cut--;
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const candidate = cur ? cur + " " + word : word;
    if (!cur || m.width(candidate, size) <= maxWidth) cur = candidate;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function fitText(
  text: string,
  boxWidth: number,
  boxHeight: number,
  startSize: number,
  m: Measurer,
  minSize = MIN_SIZE
): FitResult {
  for (let size = Math.max(startSize, minSize); size >= minSize; size -= 0.5) {
    const lines = wrapText(text, size, boxWidth, m);
    const lineHeight = size * LINE_SPACING;
    if (lines.length * lineHeight <= boxHeight * 1.02) return { size, lines, lineHeight };
  }
  return {
    size: minSize,
    lines: wrapText(text, minSize, boxWidth, m),
    lineHeight: minSize * LINE_SPACING,
  };
}
```

- [ ] **Step 4: Geçtiğini gör** — Run: `npx vitest run tests/fit.test.ts` → 5 passed.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add text wrapping and box-fitting with size shrink

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Yardımcılar — mapPool ve withRetry

**Files:**
- Create: `src/util.ts`
- Test: `tests/util.test.ts`

**Interfaces:**
- Produces: `mapPool<T,R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]>`, `interface RetryOpts { delays?: number[]; signal?: AbortSignal; sleep?: (ms: number) => Promise<void>; retryIf?: (e: unknown) => boolean }`, `withRetry<T>(fn: () => Promise<T>, opts?: RetryOpts): Promise<T>`

- [ ] **Step 1: Başarısız testi yaz**

`tests/util.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { mapPool, withRetry } from "../src/util";

describe("mapPool", () => {
  it("sırayı korur ve limiti aşmaz", async () => {
    let active = 0, maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = await mapPool(items, 3, async (n) => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    expect(maxActive).toBeLessThanOrEqual(3);
  });
});

describe("withRetry", () => {
  it("iki hatadan sonra başarır", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => { if (++calls < 3) throw new Error("geçici"); return "tamam"; },
      { delays: [1, 1, 1], sleep: async () => {} }
    );
    expect(result).toBe("tamam");
    expect(calls).toBe(3);
  });
  it("denemeler bitince son hatayı fırlatır", async () => {
    await expect(
      withRetry(async () => { throw new Error("kalıcı"); }, { delays: [1], sleep: async () => {} })
    ).rejects.toThrow("kalıcı");
  });
  it("retryIf=false hatayı hemen fırlatır", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new Error("özel"); },
        { delays: [1, 1], sleep: async () => {}, retryIf: () => false })
    ).rejects.toThrow("özel");
    expect(calls).toBe(1);
  });
  it("abort hatası yeniden denenmez", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new DOMException("x", "AbortError"); },
        { delays: [1, 1], sleep: async () => {} })
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
```

- [ ] **Step 2: Başarısızlığı gör** — Run: `npx vitest run tests/util.test.ts` → FAIL.

- [ ] **Step 3: Uygula**

`src/util.ts`:
```ts
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface RetryOpts {
  delays?: number[];
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  retryIf?: (e: unknown) => boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const { delays = [1000, 2000, 4000], signal, sleep = defaultSleep, retryIf = () => true } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    try {
      return await fn();
    } catch (e) {
      if (isAbort(e) || !retryIf(e)) throw e;
      lastErr = e;
      if (attempt < delays.length) await sleep(delays[attempt]);
    }
  }
  throw lastErr;
}
```

- [ ] **Step 4: Geçtiğini gör** — Run: `npx vitest run tests/util.test.ts` → 5 passed.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add mapPool concurrency helper and withRetry

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Ortak toplu çeviri kalıbı + Google gtx motoru

**Files:**
- Create: `src/translate/batch.ts`, `src/translate/google.ts`
- Test: `tests/google.test.ts`

**Interfaces:**
- Consumes: `makeChunks`, `splitTranslated` (Task 3); `mapPool`, `withRetry`, `isAbort` (Task 6); `TranslationEngine` (types)
- Produces: `runBatch(texts: string[], request: (text: string) => Promise<string>, opts: { concurrency: number; retryDelays: number[]; signal?: AbortSignal }): Promise<(string | null)[]>`; `parseGtxResponse(data: unknown): string`; `class GoogleGtxEngine implements TranslationEngine` — `constructor(baseUrl?: string, fetchFn?: typeof fetch, retryDelays?: number[])`

- [ ] **Step 1: Başarısız testi yaz**

`tests/google.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { GoogleGtxEngine, parseGtxResponse } from "../src/translate/google";

// gtx yanıt biçimi: [[["çeviri","orijinal",...], ...], null, "en"]
const gtxJson = (translated: string) => [[[translated, "orig", null, null, 10]], null, "en"];

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function errResponse(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

describe("parseGtxResponse", () => {
  it("segmentleri birleştirir", () => {
    const data = [[["Merhaba ", "Hello ", null], ["dünya", "world", null]], null, "en"];
    expect(parseGtxResponse(data)).toBe("Merhaba dünya");
  });
  it("bozuk yanıtta hata fırlatır", () => {
    expect(() => parseGtxResponse({ bozuk: true })).toThrow();
  });
});

describe("GoogleGtxEngine", () => {
  it("blokları çevirir ve sıraya dağıtır", async () => {
    const fetchFn = vi.fn(async () => okResponse(gtxJson("bir\niki")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0]);
    const out = await engine.translateBatch(["one", "two"], "en", "tr");
    expect(out).toEqual(["bir", "iki"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("client=gtx");
    expect(url).toContain("sl=en");
    expect(url).toContain("tl=tr");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain(encodeURIComponent("one\ntwo"));
  });
  it("uyuşmazlıkta bloklara tek tek düşer", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(okResponse(gtxJson("hepsi birleşti tek satır")))
      .mockResolvedValueOnce(okResponse(gtxJson("bir")))
      .mockResolvedValueOnce(okResponse(gtxJson("iki")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0]);
    const out = await engine.translateBatch(["one", "two"], "en", "tr");
    expect(out).toEqual(["bir", "iki"]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
  it("HTTP hatasında yeniden dener, sonra başarır", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errResponse(500))
      .mockResolvedValueOnce(okResponse(gtxJson("selam")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0]);
    const out = await engine.translateBatch(["hi"], "en", "tr");
    expect(out).toEqual(["selam"]);
  });
  it("kalıcı hatada null döner (istisna fırlatmaz)", async () => {
    const fetchFn = vi.fn(async () => errResponse(500));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0]);
    const out = await engine.translateBatch(["hi"], "en", "tr");
    expect(out).toEqual([null]);
  });
});
```

- [ ] **Step 2: Başarısızlığı gör** — Run: `npx vitest run tests/google.test.ts` → FAIL.

- [ ] **Step 3: Uygula**

`src/translate/batch.ts`:
```ts
import { makeChunks, splitTranslated } from "./chunking";
import { mapPool, withRetry, isAbort } from "../util";

export interface BatchOpts {
  concurrency: number;
  retryDelays: number[];
  signal?: AbortSignal;
}

/**
 * Ortak toplu çeviri kalıbı: blokları parçalara paketler, paralel çevirir,
 * uyuşmazlık ya da parça hatasında bloklara tek tek düşer.
 * Blok bazında başarısızlık null olarak döner — asla istisna sızdırmaz (abort hariç).
 */
export async function runBatch(
  texts: string[],
  request: (text: string) => Promise<string>,
  opts: BatchOpts
): Promise<(string | null)[]> {
  const { concurrency, retryDelays, signal } = opts;
  const chunks = makeChunks(texts);
  const out: (string | null)[] = new Array(texts.length).fill(null);
  await mapPool(chunks, concurrency, async (chunk) => {
    let parts: string[] | null = null;
    try {
      const translated = await withRetry(() => request(chunk.text), { delays: retryDelays, signal });
      parts = splitTranslated(chunk, translated);
    } catch (e) {
      if (isAbort(e)) throw e;
    }
    if (parts) {
      chunk.indices.forEach((blockIdx, j) => { out[blockIdx] = parts![j]; });
      return;
    }
    for (const blockIdx of chunk.indices) {
      try {
        out[blockIdx] = await withRetry(() => request(texts[blockIdx]), { delays: retryDelays, signal });
      } catch (e) {
        if (isAbort(e)) throw e;
        out[blockIdx] = null;
      }
    }
  });
  return out;
}
```

`src/translate/google.ts`:
```ts
import type { TranslationEngine } from "../types";
import { runBatch } from "./batch";

export function parseGtxResponse(data: unknown): string {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("beklenmeyen gtx yanıtı");
  }
  return (data[0] as unknown[])
    .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
    .join("");
}

export class GoogleGtxEngine implements TranslationEngine {
  readonly id = "google" as const;

  constructor(
    private baseUrl = "https://translate.googleapis.com",
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private retryDelays: number[] = [1000, 2000, 4000]
  ) {}

  private async request(text: string, source: string, target: string, signal?: AbortSignal): Promise<string> {
    const url = `${this.baseUrl}/translate_a/single?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&dt=t`;
    const res = await this.fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: "q=" + encodeURIComponent(text),
      signal,
    });
    if (!res.ok) throw new Error(`gtx HTTP ${res.status}`);
    return parseGtxResponse(await res.json());
  }

  translateBatch(texts: string[], source: string, target: string, signal?: AbortSignal) {
    return runBatch(texts, (t) => this.request(t, source, target, signal), {
      concurrency: 6,
      retryDelays: this.retryDelays,
      signal,
    });
  }
}
```

- [ ] **Step 4: Geçtiğini gör** — Run: `npx vitest run tests/google.test.ts` → 6 passed. Ardından tüm testler: `npm test` → hepsi geçer.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add shared batch translation and Google gtx engine

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Lingva yedek motoru + Orkestratör

**Files:**
- Create: `src/translate/lingva.ts`, `src/translate/orchestrator.ts`
- Test: `tests/orchestrator.test.ts`

**Interfaces:**
- Consumes: `runBatch` (Task 7), `TranslationEngine`, `EngineId`, `GeminiQuotaError` (types), `isAbort` (Task 6)
- Produces: `class LingvaEngine implements TranslationEngine` — `constructor(instances?: string[], fetchFn?: typeof fetch, retryDelays?: number[])`; `class Orchestrator` — `constructor(engines: TranslationEngine[])`, `translate(texts, source, target, signal?): Promise<{ results: (string | null)[]; engineId: EngineId }>`

- [ ] **Step 1: Başarısız testi yaz**

`tests/orchestrator.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { LingvaEngine } from "../src/translate/lingva";
import { Orchestrator } from "../src/translate/orchestrator";
import { GeminiQuotaError, type TranslationEngine } from "../src/types";

function fakeEngine(id: "google" | "lingva" | "gemini", impl: TranslationEngine["translateBatch"]): TranslationEngine {
  return { id, translateBatch: impl };
}

describe("LingvaEngine", () => {
  it("ilk örnek çökerse ikinci örneğe geçer", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("bağlantı yok"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ translation: "merhaba" }) });
    const engine = new LingvaEngine(["https://a", "https://b"], fetchFn as unknown as typeof fetch, [0]);
    const out = await engine.translateBatch(["hello"], "auto", "tr");
    expect(out).toEqual(["merhaba"]);
    expect(String(fetchFn.mock.calls[1][0])).toContain("https://b/api/v1/auto/tr/hello");
  });
});

describe("Orchestrator", () => {
  it("ilk motor sonuç veriyorsa onu kullanır", async () => {
    const e1 = fakeEngine("google", async (t) => t.map(() => "ç1"));
    const e2 = fakeEngine("lingva", async (t) => t.map(() => "ç2"));
    const { results, engineId } = await new Orchestrator([e1, e2]).translate(["a"], "en", "tr");
    expect(results).toEqual(["ç1"]);
    expect(engineId).toBe("google");
  });
  it("ilk motor tamamen boş dönerse ikinciye düşer", async () => {
    const e1 = fakeEngine("google", async (t) => t.map(() => null));
    const e2 = fakeEngine("lingva", async (t) => t.map(() => "yedek"));
    const { results, engineId } = await new Orchestrator([e1, e2]).translate(["a", "b"], "en", "tr");
    expect(results).toEqual(["yedek", "yedek"]);
    expect(engineId).toBe("lingva");
  });
  it("ilk motor istisna fırlatırsa ikinciye düşer", async () => {
    const e1 = fakeEngine("google", async () => { throw new Error("çöktü"); });
    const e2 = fakeEngine("lingva", async (t) => t.map(() => "yedek"));
    const { results } = await new Orchestrator([e1, e2]).translate(["a"], "en", "tr");
    expect(results).toEqual(["yedek"]);
  });
  it("GeminiQuotaError yukarı fırlar (UI karar verir)", async () => {
    const e1 = fakeEngine("gemini", async () => { throw new GeminiQuotaError(); });
    const e2 = fakeEngine("google", async (t) => t.map(() => "x"));
    await expect(new Orchestrator([e1, e2]).translate(["a"], "en", "tr")).rejects.toBeInstanceOf(GeminiQuotaError);
  });
  it("tüm motorlar çökerse null dizisi döner", async () => {
    const e1 = fakeEngine("google", async () => { throw new Error("1"); });
    const e2 = fakeEngine("lingva", async () => { throw new Error("2"); });
    const { results } = await new Orchestrator([e1, e2]).translate(["a", "b"], "en", "tr");
    expect(results).toEqual([null, null]);
  });
});
```

- [ ] **Step 2: Başarısızlığı gör** — Run: `npx vitest run tests/orchestrator.test.ts` → FAIL.

- [ ] **Step 3: Uygula**

`src/translate/lingva.ts`:
```ts
import type { TranslationEngine } from "../types";
import { runBatch } from "./batch";
import { isAbort } from "../util";

export class LingvaEngine implements TranslationEngine {
  readonly id = "lingva" as const;

  constructor(
    private instances: string[] = ["https://lingva.ml", "https://translate.plausibility.cloud"],
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private retryDelays: number[] = [1000, 2000]
  ) {}

  private async request(text: string, source: string, target: string, signal?: AbortSignal): Promise<string> {
    let lastErr: unknown = new Error("lingva erişilemedi");
    for (const base of this.instances) {
      try {
        const res = await this.fetchFn(
          `${base}/api/v1/${encodeURIComponent(source)}/${encodeURIComponent(target)}/${encodeURIComponent(text)}`,
          { signal }
        );
        if (!res.ok) throw new Error(`lingva HTTP ${res.status}`);
        const data = (await res.json()) as { translation?: unknown };
        if (typeof data.translation !== "string") throw new Error("beklenmeyen lingva yanıtı");
        return data.translation;
      } catch (e) {
        if (isAbort(e)) throw e;
        lastErr = e;
      }
    }
    throw lastErr;
  }

  translateBatch(texts: string[], source: string, target: string, signal?: AbortSignal) {
    return runBatch(texts, (t) => this.request(t, source, target, signal), {
      concurrency: 3,
      retryDelays: this.retryDelays,
      signal,
    });
  }
}
```

`src/translate/orchestrator.ts`:
```ts
import { GeminiQuotaError, type EngineId, type TranslationEngine } from "../types";
import { isAbort } from "../util";

export class Orchestrator {
  constructor(private engines: TranslationEngine[]) {
    if (engines.length === 0) throw new Error("en az bir motor gerekli");
  }

  async translate(
    texts: string[],
    source: string,
    target: string,
    signal?: AbortSignal
  ): Promise<{ results: (string | null)[]; engineId: EngineId }> {
    for (const engine of this.engines) {
      try {
        const results = await engine.translateBatch(texts, source, target, signal);
        const okCount = results.filter((r) => r !== null).length;
        if (okCount > 0 || texts.length === 0) return { results, engineId: engine.id };
      } catch (e) {
        if (isAbort(e) || e instanceof GeminiQuotaError) throw e;
        // motor düzeyinde hata: sıradaki motora geç
      }
    }
    return {
      results: texts.map(() => null),
      engineId: this.engines[this.engines.length - 1].id,
    };
  }
}
```

- [ ] **Step 4: Geçtiğini gör** — Run: `npx vitest run tests/orchestrator.test.ts` → 6 passed.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add Lingva fallback engine and engine orchestrator

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Gemini motoru + anahtar saklama

**Files:**
- Create: `src/translate/gemini.ts`, `src/translate/settings.ts`
- Test: `tests/gemini.test.ts`

**Interfaces:**
- Consumes: `withRetry`, `isAbort` (Task 6); `GeminiQuotaError`, `TranslationEngine` (types)
- Produces: `buildGeminiPrompt(texts: string[], source: string, target: string): string`; `parseGeminiResponse(text: string, count: number): string[] | null`; `class GeminiEngine implements TranslationEngine` — `constructor(apiKey: string, fetchFn?: typeof fetch, minIntervalMs?: number, sleep?: (ms:number)=>Promise<void>, retryDelays?: number[])`; `getGeminiKey(): string`, `setGeminiKey(v: string): void`

- [ ] **Step 1: Başarısız testi yaz**

`tests/gemini.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { buildGeminiPrompt, parseGeminiResponse, GeminiEngine } from "../src/translate/gemini";
import { GeminiQuotaError } from "../src/types";

const geminiOk = (text: string) => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});

describe("buildGeminiPrompt", () => {
  it("işaretleyicilerle numaralar", () => {
    const p = buildGeminiPrompt(["Hello", "World"], "en", "tr");
    expect(p).toContain("⟦0⟧Hello");
    expect(p).toContain("⟦1⟧World");
    expect(p.toLowerCase()).toContain('"tr"');
  });
});

describe("parseGeminiResponse", () => {
  it("işaretleyicileri ayrıştırır", () => {
    expect(parseGeminiResponse("⟦0⟧Merhaba\n⟦1⟧Dünya", 2)).toEqual(["Merhaba", "Dünya"]);
  });
  it("eksik işaretleyicide null döner", () => {
    expect(parseGeminiResponse("⟦0⟧Merhaba", 2)).toBeNull();
  });
});

describe("GeminiEngine", () => {
  const fastEngine = (fetchFn: unknown, key = "KEY") =>
    new GeminiEngine(key, fetchFn as never, 0, async () => {}, [0]);

  it("toplu çevirir", async () => {
    const fetchFn = vi.fn(async () => geminiOk("⟦0⟧bir\n⟦1⟧iki"));
    const out = await fastEngine(fetchFn).translateBatch(["one", "two"], "en", "tr");
    expect(out).toEqual(["bir", "iki"]);
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain("gemini-flash-latest:generateContent");
    expect(url).toContain("key=KEY");
  });
  it("bozuk yanıtta bloklara tek tek düşer", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(geminiOk("işaretleyiciler kayboldu"))
      .mockResolvedValueOnce(geminiOk("⟦0⟧bir"))
      .mockResolvedValueOnce(geminiOk("⟦0⟧iki"));
    const out = await fastEngine(fetchFn).translateBatch(["one", "two"], "en", "tr");
    expect(out).toEqual(["bir", "iki"]);
  });
  it("429'da GeminiQuotaError fırlatır", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await expect(fastEngine(fetchFn).translateBatch(["x"], "en", "tr"))
      .rejects.toBeInstanceOf(GeminiQuotaError);
  });
});
```

- [ ] **Step 2: Başarısızlığı gör** — Run: `npx vitest run tests/gemini.test.ts` → FAIL.

- [ ] **Step 3: Uygula**

`src/translate/gemini.ts`:
```ts
import { GeminiQuotaError, type TranslationEngine } from "../types";
import { withRetry, isAbort } from "../util";

const MODEL = "gemini-flash-latest";
const GROUP_MAX_CHARS = 8000;

export function buildGeminiPrompt(texts: string[], source: string, target: string): string {
  const body = texts.map((t, i) => `⟦${i}⟧${t.replace(/\s*\n\s*/g, " ")}`).join("\n");
  const src = source === "auto" ? "the auto-detected source language" : `the language with ISO code "${source}"`;
  return (
    `Translate the following numbered segments from ${src} to the language with ISO code "${target}".\n` +
    `Rules: output ONLY the translations; keep every ⟦N⟧ marker exactly once, in the same order, ` +
    `at the start of its translated segment; do not add any comments, notes or extra text; ` +
    `preserve meaning, tone and numbers.\n\n${body}`
  );
}

export function parseGeminiResponse(text: string, count: number): string[] | null {
  const re = /⟦(\d+)⟧([\s\S]*?)(?=⟦\d+⟧|$)/g;
  const out = new Array<string | null>(count).fill(null);
  let found = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const idx = Number(match[1]);
    if (idx >= 0 && idx < count && out[idx] === null) {
      out[idx] = match[2].trim();
      found++;
    }
  }
  return found === count ? (out as string[]) : null;
}

export class GeminiEngine implements TranslationEngine {
  readonly id = "gemini" as const;
  private lastRequestAt = 0;

  constructor(
    private apiKey: string,
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private minIntervalMs = 4500,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private retryDelays: number[] = [2000, 5000]
  ) {}

  private async request(prompt: string, signal?: AbortSignal): Promise<string> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastRequestAt = Date.now();
    const res = await this.fetchFn(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(this.apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1 },
        }),
        signal,
      }
    );
    if (res.status === 429) throw new GeminiQuotaError();
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (text.length === 0) throw new Error("boş Gemini yanıtı");
    return text;
  }

  private retryOpts(signal?: AbortSignal) {
    return {
      delays: this.retryDelays,
      signal,
      retryIf: (e: unknown) => !(e instanceof GeminiQuotaError),
    };
  }

  async translateBatch(
    texts: string[],
    source: string,
    target: string,
    signal?: AbortSignal
  ): Promise<(string | null)[]> {
    const groups: number[][] = [];
    let cur: number[] = [];
    let len = 0;
    texts.forEach((t, i) => {
      if (cur.length > 0 && len + t.length > GROUP_MAX_CHARS) {
        groups.push(cur);
        cur = [];
        len = 0;
      }
      cur.push(i);
      len += t.length;
    });
    if (cur.length > 0) groups.push(cur);

    const out: (string | null)[] = new Array(texts.length).fill(null);
    for (const group of groups) {
      const groupTexts = group.map((i) => texts[i]);
      let parts: string[] | null = null;
      try {
        const raw = await withRetry(
          () => this.request(buildGeminiPrompt(groupTexts, source, target), signal),
          this.retryOpts(signal)
        );
        parts = parseGeminiResponse(raw, groupTexts.length);
      } catch (e) {
        if (isAbort(e) || e instanceof GeminiQuotaError) throw e;
      }
      if (parts) {
        group.forEach((blockIdx, j) => { out[blockIdx] = parts![j]; });
        continue;
      }
      for (let j = 0; j < group.length; j++) {
        try {
          const raw = await withRetry(
            () => this.request(buildGeminiPrompt([groupTexts[j]], source, target), signal),
            this.retryOpts(signal)
          );
          const single = parseGeminiResponse(raw, 1);
          out[group[j]] = single ? single[0] : null;
        } catch (e) {
          if (isAbort(e) || e instanceof GeminiQuotaError) throw e;
          out[group[j]] = null;
        }
      }
    }
    return out;
  }
}
```

`src/translate/settings.ts`:
```ts
const KEY = "pdf-cevirmen.gemini-key";

export function getGeminiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setGeminiKey(v: string): void {
  try {
    const t = v.trim();
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    // localStorage kapalıysa anahtar bu oturumla sınırlı kalır
  }
}
```

- [ ] **Step 4: Geçtiğini gör** — Run: `npx vitest run tests/gemini.test.ts` → 6 passed. `npm test` → tümü geçer.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add Gemini BYOK engine with marker protocol and key storage

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: PDF metin çıkarma sarmalayıcısı

**Files:**
- Create: `src/pdf/extract.ts`
- Test: `tests/extract.test.ts`

**Interfaces:**
- Consumes: `toRawItems` (Task 4), `PdfPasswordError` (types)
- Produces: `interface PageText { items: RawItem[]; width: number; height: number; scanned: boolean }`; `analyzePageText(textItems: unknown[], width: number, height: number): PageText`; `loadPdf(data: ArrayBuffer): Promise<PDFDocumentProxy>`; `extractPageText(page: PDFPageProxy): Promise<PageText>`

- [ ] **Step 1: Başarısız testi yaz**

Test, gerçek bir PDF'i pdf-lib ile üretir, pdf.js'in Node (legacy) derlemesiyle açar ve `analyzePageText`'in gerçek pdf.js çıktısıyla çalıştığını doğrular (uçtan uca metin çıkarma güvencesi).

`tests/extract.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { analyzePageText } from "../src/pdf/extract";

async function makeFixturePdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText("Hello translated world", { x: 50, y: 700, size: 14, font });
  page.drawText("Second paragraph here", { x: 50, y: 650, size: 12, font });
  return doc.save();
}

describe("analyzePageText (gerçek pdf.js ile)", () => {
  it("metni konumuyla çıkarır", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const bytes = await makeFixturePdf();
    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const result = analyzePageText(content.items, viewport.width, viewport.height);
    expect(result.scanned).toBe(false);
    expect(result.width).toBe(600);
    expect(result.height).toBe(800);
    const all = result.items.map((i) => i.text).join(" ");
    expect(all).toContain("Hello");
    expect(all).toContain("Second");
    // y üstten ölçülür: y=700 taban çizgisi → üst kenar ~800-700-14 = 86 civarı
    expect(result.items[0].y).toBeGreaterThan(60);
    expect(result.items[0].y).toBeLessThan(110);
  });
  it("boş sayfayı taranmış sayar", () => {
    const result = analyzePageText([], 600, 800);
    expect(result.scanned).toBe(true);
  });
});
```

- [ ] **Step 2: Başarısızlığı gör** — Run: `npx vitest run tests/extract.test.ts` → FAIL (modül yok).

- [ ] **Step 3: Uygula**

`src/pdf/extract.ts`:
```ts
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import { PdfPasswordError, type RawItem } from "../types";
import { toRawItems, type PdfTextItem } from "./grouping";

// Tarayıcıda worker; Node test ortamında bu modül import edilse de
// worker yalnızca getDocument çağrısında gerekir.
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
```

Not: `analyzePageText` testte doğrudan pdf.js legacy çıktısıyla beslenir; `loadPdf`/`extractPageText` tarayıcı entegrasyonu Task 14'ün elle doğrulamasında sınanır. Test Node'da `pdfjs-dist/legacy/build/pdf.mjs` import edemezse (sürüme göre yol değişebilir), `pdfjs-dist/legacy/build/pdf.min.mjs` yolunu dene.

- [ ] **Step 4: Geçtiğini gör** — Run: `npx vitest run tests/extract.test.ts` → 2 passed.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add pdf.js extraction wrapper with scanned-page detection

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Sayfa render, arka plan örnekleme, maskeleme

**Files:**
- Create: `src/pdf/render.ts`
- Test: `tests/render.test.ts`

**Interfaces:**
- Consumes: `Block` (types)
- Produces: `computeScale(widthPt: number, heightPt: number): number`; `interface Bitmap { data: Uint8ClampedArray; width: number; height: number }`; `sampleBackground(bmp: Bitmap, rect: {x:number;y:number;width:number;height:number}): [number, number, number]`; tarayıcı-yalnızca: `renderPageToCanvas(page: PDFPageProxy, scale: number): Promise<HTMLCanvasElement>`, `maskBlocks(canvas, blocks: Block[], scale: number): void`, `canvasToJpeg(canvas, quality?): Promise<Uint8Array>`, `makePreview(canvas, maxWidth?): HTMLCanvasElement`

- [ ] **Step 1: Başarısız testi yaz**

`tests/render.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeScale, sampleBackground, type Bitmap } from "../src/pdf/render";

describe("computeScale", () => {
  it("A4 için 2 döner", () => {
    expect(computeScale(595, 842)).toBe(2);
  });
  it("dev sayfada 3000px tavanına iner", () => {
    expect(computeScale(3000, 2000)).toBe(1);
    expect(computeScale(6000, 1000)).toBeCloseTo(0.5);
  });
});

describe("sampleBackground", () => {
  function solidBitmap(w: number, h: number, rgb: [number, number, number]): Bitmap {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = rgb[0]; data[i * 4 + 1] = rgb[1]; data[i * 4 + 2] = rgb[2]; data[i * 4 + 3] = 255;
    }
    return { data, width: w, height: h };
  }
  it("kenar renginin medyanını döner", () => {
    const bmp = solidBitmap(100, 100, [250, 240, 230]);
    // merkezi siyah boya (metin gibi) — kenar örneklemesi etkilenmemeli
    for (let y = 40; y < 60; y++) for (let x = 40; x < 60; x++) {
      const o = (y * 100 + x) * 4;
      bmp.data[o] = 0; bmp.data[o + 1] = 0; bmp.data[o + 2] = 0;
    }
    const [r, g, b] = sampleBackground(bmp, { x: 38, y: 38, width: 24, height: 24 });
    expect(r).toBe(250); expect(g).toBe(240); expect(b).toBe(230);
  });
  it("kenar dışına taşan dikdörtgeni kırpar (hata fırlatmaz)", () => {
    const bmp = solidBitmap(10, 10, [255, 255, 255]);
    const [r] = sampleBackground(bmp, { x: -5, y: -5, width: 30, height: 30 });
    expect(r).toBe(255);
  });
});
```

- [ ] **Step 2: Başarısızlığı gör** — Run: `npx vitest run tests/render.test.ts` → FAIL.

- [ ] **Step 3: Uygula**

`src/pdf/render.ts`:
```ts
import type { PDFPageProxy } from "pdfjs-dist";
import type { Block } from "../types";

export const MAX_EDGE_PX = 3000;
const MASK_PAD_PT = 1.5;

export function computeScale(widthPt: number, heightPt: number): number {
  return Math.min(2, MAX_EDGE_PX / Math.max(widthPt, heightPt));
}

export interface Bitmap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export function sampleBackground(
  bmp: Bitmap,
  rect: { x: number; y: number; width: number; height: number }
): [number, number, number] {
  const pad = 3;
  const x0 = Math.min(bmp.width - 1, Math.max(0, Math.round(rect.x) - pad));
  const x1 = Math.min(bmp.width - 1, Math.max(0, Math.round(rect.x + rect.width) + pad));
  const y0 = Math.min(bmp.height - 1, Math.max(0, Math.round(rect.y) - pad));
  const y1 = Math.min(bmp.height - 1, Math.max(0, Math.round(rect.y + rect.height) + pad));
  const rs: number[] = [], gs: number[] = [], bs: number[] = [];
  const stepX = Math.max(1, Math.floor((x1 - x0) / 20));
  const stepY = Math.max(1, Math.floor((y1 - y0) / 20));
  const push = (x: number, y: number) => {
    const o = (y * bmp.width + x) * 4;
    rs.push(bmp.data[o]); gs.push(bmp.data[o + 1]); bs.push(bmp.data[o + 2]);
  };
  for (let x = x0; x <= x1; x += stepX) { push(x, y0); push(x, y1); }
  for (let y = y0; y <= y1; y += stepY) { push(x0, y); push(x1, y); }
  const med = (a: number[]) => {
    if (a.length === 0) return 255;
    const s = [...a].sort((p, q) => p - q);
    return s[Math.floor(s.length / 2)];
  };
  return [med(rs), med(gs), med(bs)];
}

// ---- Aşağıdakiler tarayıcı ortamı gerektirir (Task 14 elle doğrulamasında sınanır) ----

export async function renderPageToCanvas(page: PDFPageProxy, scale: number): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(viewport.width);
  canvas.height = Math.floor(viewport.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d bağlamı alınamadı");
  await page.render({ canvasContext: ctx, viewport }).promise;
  return canvas;
}

export function maskBlocks(canvas: HTMLCanvasElement, blocks: Block[], scale: number): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const bmp: Bitmap = { data: img.data, width: img.width, height: img.height };
  for (const b of blocks) {
    if (!b.translated) continue;
    const rect = {
      x: (b.x - MASK_PAD_PT) * scale,
      y: (b.y - MASK_PAD_PT) * scale,
      width: (b.width + 2 * MASK_PAD_PT) * scale,
      height: (b.height + 2 * MASK_PAD_PT) * scale,
    };
    const [r, g, bb] = sampleBackground(bmp, rect);
    ctx.fillStyle = `rgb(${r},${g},${bb})`;
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
  }
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.85): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      async (blob) => {
        if (!blob) return reject(new Error("JPEG oluşturulamadı"));
        resolve(new Uint8Array(await blob.arrayBuffer()));
      },
      "image/jpeg",
      quality
    );
  });
}

export function makePreview(canvas: HTMLCanvasElement, maxWidth = 900): HTMLCanvasElement {
  const ratio = Math.min(1, maxWidth / canvas.width);
  const small = document.createElement("canvas");
  small.width = Math.floor(canvas.width * ratio);
  small.height = Math.floor(canvas.height * ratio);
  small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
  return small;
}
```

- [ ] **Step 4: Geçtiğini gör** — Run: `npx vitest run tests/render.test.ts` → 4 passed.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add page render, background sampling and block masking

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Çıktı PDF üretici

**Files:**
- Create: `src/pdf/build.ts`
- Test: `tests/build.test.ts`

**Interfaces:**
- Consumes: `fitText`, `Measurer` (Task 5); `Block` (types)
- Produces: `sanitizeForFont(t: string): string`; `class OutputPdfBuilder` — `static create(regularBytes: Uint8Array, boldBytes: Uint8Array): Promise<OutputPdfBuilder>`, `addPage(jpeg: Uint8Array, widthPt: number, heightPt: number, blocks: Block[]): Promise<void>`, `save(): Promise<Uint8Array>`

- [ ] **Step 1: Başarısız testi yaz**

`tests/build.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PDFDocument } from "pdf-lib";
import { OutputPdfBuilder, sanitizeForFont } from "../src/pdf/build";
import type { Block } from "../src/types";

// 1x1 piksel geçerli JPEG
const TINY_JPEG = Uint8Array.from(
  atob(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q=="
  ),
  (c) => c.charCodeAt(0)
);

const block = (over: Partial<Block> = {}): Block => ({
  text: "Hello world",
  x: 50, y: 100, width: 300, height: 40,
  fontSize: 12, bold: false, translatable: true,
  translated: "Merhaba dünya — çeviri şöyle görünür: ğüşıöçĞÜŞİÖÇ",
  failed: false,
  ...over,
});

describe("sanitizeForFont", () => {
  it("Türkçe karakterleri korur", () => {
    expect(sanitizeForFont("ğüşıöç ĞÜŞİÖÇ â€”test")).toContain("ğüşıöç");
  });
  it("emojiyi temizler", () => {
    expect(sanitizeForFont("selam 👋 dünya")).toBe("selam  dünya");
  });
});

describe("OutputPdfBuilder", () => {
  it("çevirili sayfa üretir ve çıktı geçerli PDF olur", async () => {
    const regular = readFileSync("public/fonts/NotoSans-Regular.ttf");
    const bold = readFileSync("public/fonts/NotoSans-Bold.ttf");
    const builder = await OutputPdfBuilder.create(new Uint8Array(regular), new Uint8Array(bold));
    await builder.addPage(TINY_JPEG, 600, 800, [block(), block({ y: 200, bold: true })]);
    await builder.addPage(TINY_JPEG, 600, 800, []); // çevirisiz (taranmış) sayfa
    const bytes = await builder.save();
    const reloaded = await PDFDocument.load(bytes);
    expect(reloaded.getPageCount()).toBe(2);
    expect(reloaded.getPage(0).getWidth()).toBe(600);
  });
  it("translated=null blokları atlar", async () => {
    const regular = readFileSync("public/fonts/NotoSans-Regular.ttf");
    const bold = readFileSync("public/fonts/NotoSans-Bold.ttf");
    const builder = await OutputPdfBuilder.create(new Uint8Array(regular), new Uint8Array(bold));
    await builder.addPage(TINY_JPEG, 600, 800, [block({ translated: null, failed: true })]);
    const bytes = await builder.save();
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });
});
```

- [ ] **Step 2: Başarısızlığı gör** — Run: `npx vitest run tests/build.test.ts` → FAIL.

- [ ] **Step 3: Uygula**

`src/pdf/build.ts`:
```ts
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { Block } from "../types";
import { fitText, type Measurer } from "../layout/fit";

const OVERFLOW_LIMIT = 1.1; // blok yüksekliğinin en fazla %110'una kadar çiz

// Noto Sans'ın kapsamadığı karakterleri temizle (Latin, Latin-ek, Yunan, Kiril,
// Latin Extended Additional (Vietnamca), genel noktalama, para birimleri)
export function sanitizeForFont(t: string): string {
  return t.replace(
    /[^	 -~ -ɏͰ-ϿЀ-ӿḀ-ỿ‐-‧‰-⁞₠-₿™À-ÿ]/g,
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
```

- [ ] **Step 4: Geçtiğini gör** — Run: `npx vitest run tests/build.test.ts` → 4 passed.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add output PDF builder with embedded Noto Sans and text fitting

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 13: Sayfa hattı koordinatörü (pipeline)

**Files:**
- Create: `src/pipeline.ts`
- Test: `tests/pipeline.test.ts`

**Interfaces:**
- Consumes: `groupIntoLines`, `groupIntoBlocks` (Task 4); `PageText` (Task 10); `Block` (types)
- Produces:
```ts
interface PageStage {
  extract(pageNum: number): Promise<PageText>;
  translate(texts: string[], signal?: AbortSignal): Promise<(string | null)[]>;
  renderMasked(pageNum: number, blocks: Block[]): Promise<{ jpeg: Uint8Array; widthPt: number; heightPt: number }>;
  addPage(jpeg: Uint8Array, widthPt: number, heightPt: number, blocks: Block[]): Promise<void>;
}
interface PipelineEvents { onPageDone?(done: number, total: number): void; onScannedPage?(pageNum: number): void; }
interface PipelineResult { translatedPages: number; scannedPages: number[]; failedBlocks: number; totalBlocks: number; }
runPipeline(pageNumbers: number[], stage: PageStage, events?: PipelineEvents, signal?: AbortSignal): Promise<PipelineResult>
```

- [ ] **Step 1: Başarısız testi yaz**

`tests/pipeline.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { runPipeline, type PageStage } from "../src/pipeline";
import type { RawItem } from "../src/types";

const textItem = (text: string, y: number): RawItem =>
  ({ text, x: 10, y, width: 200, height: 10, fontSize: 10, fontName: "F" });

function fakeStage(pages: Record<number, RawItem[]>, translateImpl?: PageStage["translate"]): PageStage & { added: number[] } {
  const added: number[] = [];
  return {
    added,
    extract: async (n) => ({
      items: pages[n] ?? [],
      width: 600,
      height: 800,
      scanned: (pages[n] ?? []).length < 3,
    }),
    translate: translateImpl ?? (async (texts) => texts.map((t) => "ç:" + t)),
    renderMasked: async () => ({ jpeg: new Uint8Array([1]), widthPt: 600, heightPt: 800 }),
    addPage: async (_j, _w, _h, blocks) => { added.push(blocks.filter((b) => b.translated).length); },
  };
}

const threeItems = [textItem("Bir cümle burada.", 100), textItem("İkinci cümle burada.", 130), textItem("Üçüncü cümle burada.", 160)];

describe("runPipeline", () => {
  it("normal sayfayı çevirir ve ilerleme bildirir", async () => {
    const stage = fakeStage({ 1: threeItems });
    const onPageDone = vi.fn();
    const result = await runPipeline([1], stage, { onPageDone });
    expect(result.translatedPages).toBe(1);
    expect(result.scannedPages).toEqual([]);
    expect(onPageDone).toHaveBeenCalledWith(1, 1);
    expect(stage.added[0]).toBeGreaterThan(0);
  });
  it("taranmış sayfayı çevirmeden kopyalar ve raporlar", async () => {
    const stage = fakeStage({ 1: [] });
    const onScannedPage = vi.fn();
    const result = await runPipeline([1], stage, { onScannedPage });
    expect(result.scannedPages).toEqual([1]);
    expect(onScannedPage).toHaveBeenCalledWith(1);
    expect(stage.added[0]).toBe(0);
  });
  it("başarısız blokları sayar", async () => {
    const stage = fakeStage({ 1: threeItems }, async (texts) => texts.map((_, i) => (i === 0 ? null : "ç")));
    const result = await runPipeline([1], stage);
    expect(result.failedBlocks).toBe(1);
    expect(result.totalBlocks).toBeGreaterThanOrEqual(2);
  });
  it("abort sinyalinde durur", async () => {
    const ac = new AbortController();
    ac.abort();
    const stage = fakeStage({ 1: threeItems });
    await expect(runPipeline([1], stage, {}, ac.signal)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Başarısızlığı gör** — Run: `npx vitest run tests/pipeline.test.ts` → FAIL.

- [ ] **Step 3: Uygula**

`src/pipeline.ts`:
```ts
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
```

- [ ] **Step 4: Geçtiğini gör** — Run: `npx vitest run tests/pipeline.test.ts` → 4 passed. `npm test` → tümü geçer.

- [ ] **Step 5: Commit**

```powershell
git add -A; git commit -m "feat: add page pipeline coordinator with progress and abort

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 14: Arayüz ve uçtan uca bağlama

**Files:**
- Modify: `index.html` (tam sürüm), `src/main.ts` (tam sürüm)
- Create: `styles.css`

**Interfaces:**
- Consumes: önceki TÜM görevlerin dışa aktarımları. Yeni dışa aktarım üretmez (uygulama giriş noktası).

- [ ] **Step 1: index.html tam sürümünü yaz**

```html
<!doctype html>
<html lang="tr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PDF Çevirmen — Ücretsiz PDF Çevirisi</title>
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
  <header>
    <h1 id="app-name"></h1>
    <p id="tagline"></p>
  </header>

  <main>
    <section id="setup-screen">
      <div id="dropzone" tabindex="0" role="button">
        <p id="drop-hint"></p>
        <input type="file" id="file-input" accept="application/pdf,.pdf" hidden />
      </div>
      <div class="controls">
        <label>
          <span id="source-label"></span>
          <select id="source-lang"></select>
        </label>
        <label>
          <span id="target-label"></span>
          <select id="target-lang"></select>
        </label>
        <span id="engine-badge" class="badge"></span>
      </div>
      <details id="settings">
        <summary id="settings-title"></summary>
        <label>
          <span id="gemini-key-label"></span>
          <input type="password" id="gemini-key" autocomplete="off" />
        </label>
        <p id="gemini-key-hint" class="hint"></p>
      </details>
      <p id="privacy" class="hint"></p>
    </section>

    <section id="work-screen" hidden>
      <div class="controls">
        <label>
          <span id="range-label"></span>
          <input type="number" id="range-from" min="1" style="width:5em" />
          –
          <input type="number" id="range-to" min="1" style="width:5em" />
        </label>
        <button id="start-btn"></button>
        <button id="cancel-btn" hidden></button>
        <button id="download-btn" hidden></button>
        <label><input type="checkbox" id="compare-toggle" /> <span id="compare-label"></span></label>
      </div>
      <p id="status" role="status"></p>
      <progress id="progress" max="100" value="0" hidden></progress>
      <div id="warnings"></div>
      <div id="preview"></div>
    </section>
  </main>

  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 2: styles.css yaz**

```css
:root { --fg: #1a1a2e; --muted: #666; --accent: #2563eb; --bg: #f7f7fb; }
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; color: var(--fg); background: var(--bg); margin: 0 auto; max-width: 980px; padding: 16px; }
header h1 { margin: 8px 0 0; }
header p { color: var(--muted); margin-top: 4px; }
#dropzone { border: 2px dashed var(--accent); border-radius: 12px; padding: 48px 16px; text-align: center; cursor: pointer; background: #fff; }
#dropzone.dragover { background: #eef4ff; }
.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 16px 0; }
.controls label { display: flex; gap: 6px; align-items: center; }
select, input, button { font: inherit; padding: 6px 10px; border-radius: 8px; border: 1px solid #ccc; }
button { background: var(--accent); color: #fff; border: none; cursor: pointer; }
button:disabled { background: #aaa; cursor: default; }
.badge { background: #e2e8f0; border-radius: 999px; padding: 4px 12px; font-size: 0.85em; }
.hint { color: var(--muted); font-size: 0.85em; }
#warnings p { background: #fff7e0; border: 1px solid #eab308; border-radius: 8px; padding: 8px 12px; }
#warnings p.error { background: #fee; border-color: #dc2626; }
#preview { display: flex; flex-direction: column; gap: 12px; margin-top: 16px; }
#preview.compare .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
#preview canvas { width: 100%; height: auto; border: 1px solid #ddd; border-radius: 6px; background: #fff; }
progress { width: 100%; height: 12px; }
details { background: #fff; border-radius: 8px; padding: 8px 12px; margin: 12px 0; }
```

- [ ] **Step 3: src/main.ts tam sürümünü yaz**

```ts
import { STR, SOURCE_LANGS, TARGET_LANGS } from "./strings";
import type { Block, TranslationEngine } from "./types";
import { PdfPasswordError, GeminiQuotaError } from "./types";
import { loadPdf, extractPageText } from "./pdf/extract";
import {
  computeScale, renderPageToCanvas, maskBlocks, canvasToJpeg, makePreview,
} from "./pdf/render";
import { OutputPdfBuilder } from "./pdf/build";
import { GoogleGtxEngine } from "./translate/google";
import { LingvaEngine } from "./translate/lingva";
import { GeminiEngine } from "./translate/gemini";
import { Orchestrator } from "./translate/orchestrator";
import { getGeminiKey, setGeminiKey } from "./translate/settings";
import { runPipeline, type PageStage } from "./pipeline";
import { isAbort } from "./util";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`eleman yok: ${id}`);
  return el as T;
};

// --- statik metinleri bağla ---
document.title = `${STR.appName} — ${STR.tagline}`;
$("app-name").textContent = STR.appName;
$("tagline").textContent = STR.tagline;
$("drop-hint").textContent = STR.dropHint;
$("source-label").textContent = STR.sourceLang;
$("target-label").textContent = STR.targetLang;
$("settings-title").textContent = STR.settings;
$("gemini-key-label").textContent = STR.geminiKeyLabel;
$("gemini-key-hint").textContent = STR.geminiKeyHint;
$("privacy").textContent = STR.privacy;
$("range-label").textContent = STR.pageRange;
$("start-btn").textContent = STR.start;
$("cancel-btn").textContent = STR.cancel;
$("download-btn").textContent = STR.download;
$("compare-label").textContent = STR.compare;

const sourceSel = $<HTMLSelectElement>("source-lang");
const targetSel = $<HTMLSelectElement>("target-lang");
for (const [code, name] of SOURCE_LANGS) sourceSel.add(new Option(name, code));
for (const [code, name] of TARGET_LANGS) targetSel.add(new Option(name, code));
sourceSel.value = "auto";
targetSel.value = "tr";

const geminiInput = $<HTMLInputElement>("gemini-key");
geminiInput.value = getGeminiKey();
const engineBadge = $("engine-badge");
function refreshEngineBadge(): void {
  engineBadge.textContent = getGeminiKey() ? STR.engineGemini : STR.engineGoogle;
}
geminiInput.addEventListener("change", () => { setGeminiKey(geminiInput.value); refreshEngineBadge(); });
refreshEngineBadge();

// --- durum ---
let pdfBytes: ArrayBuffer | null = null;
let pageCount = 0;
let abortCtrl: AbortController | null = null;
let outputBytes: Uint8Array | null = null;
let outputName = "ceviri.pdf";

const statusEl = $("status");
const warningsEl = $("warnings");
const progressEl = $<HTMLProgressElement>("progress");
const previewEl = $("preview");
const startBtn = $<HTMLButtonElement>("start-btn");
const cancelBtn = $<HTMLButtonElement>("cancel-btn");
const downloadBtn = $<HTMLButtonElement>("download-btn");
const rangeFrom = $<HTMLInputElement>("range-from");
const rangeTo = $<HTMLInputElement>("range-to");

function warn(msg: string, isError = false): void {
  const p = document.createElement("p");
  p.textContent = msg;
  if (isError) p.className = "error";
  warningsEl.appendChild(p);
}

// --- dosya seçimi ---
const dropzone = $("dropzone");
const fileInput = $<HTMLInputElement>("file-input");
dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") fileInput.click(); });
dropzone.addEventListener("dragover", (e) => { e.preventDefault(); dropzone.classList.add("dragover"); });
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const f = e.dataTransfer?.files?.[0];
  if (f) void handleFile(f);
});
fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) void handleFile(f);
});

async function handleFile(file: File): Promise<void> {
  warningsEl.innerHTML = "";
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    warn(STR.errNotPdf, true);
    return;
  }
  statusEl.textContent = STR.preparing;
  try {
    pdfBytes = await file.arrayBuffer();
    const doc = await loadPdf(pdfBytes.slice(0));
    pageCount = doc.numPages;
    void doc.destroy();
    outputName = file.name.replace(/\.pdf$/i, "") + ".ceviri.pdf";
    rangeFrom.value = "1";
    rangeFrom.max = String(pageCount);
    rangeTo.value = String(pageCount);
    rangeTo.max = String(pageCount);
    if (pageCount > 300) warn(STR.warnBigFile);
    $("work-screen").hidden = false;
    statusEl.textContent = `${file.name} — ${pageCount} sayfa`;
    startBtn.disabled = false;
  } catch (e) {
    pdfBytes = null;
    statusEl.textContent = "";
    warn(e instanceof PdfPasswordError ? STR.errPassword : STR.errBroken, true);
  }
}

// --- motor kurulumu ---
function buildOrchestrator(includeGemini: boolean): Orchestrator {
  const engines: TranslationEngine[] = [];
  const key = getGeminiKey();
  if (includeGemini && key) engines.push(new GeminiEngine(key));
  engines.push(new GoogleGtxEngine(), new LingvaEngine());
  return new Orchestrator(engines);
}

// --- çeviri akışı ---
startBtn.addEventListener("click", () => void startTranslation());
cancelBtn.addEventListener("click", () => abortCtrl?.abort());
downloadBtn.addEventListener("click", () => {
  if (!outputBytes) return;
  const blob = new Blob([outputBytes as BlobPart], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = outputName;
  a.click();
  URL.revokeObjectURL(a.href);
});
$<HTMLInputElement>("compare-toggle").addEventListener("change", (e) => {
  previewEl.classList.toggle("compare", (e.target as HTMLInputElement).checked);
});

async function startTranslation(): Promise<void> {
  if (!pdfBytes) return;
  const from = Math.max(1, Math.min(pageCount, Number(rangeFrom.value) || 1));
  const to = Math.max(from, Math.min(pageCount, Number(rangeTo.value) || pageCount));
  const pages = Array.from({ length: to - from + 1 }, (_, i) => from + i);

  startBtn.disabled = true;
  cancelBtn.hidden = false;
  downloadBtn.hidden = true;
  progressEl.hidden = false;
  progressEl.value = 0;
  warningsEl.innerHTML = "";
  previewEl.innerHTML = "";
  outputBytes = null;
  abortCtrl = new AbortController();
  const signal = abortCtrl.signal;

  let orchestrator = buildOrchestrator(true);
  const source = sourceSel.value;
  const target = targetSel.value;

  try {
    const doc = await loadPdf(pdfBytes.slice(0));
    const base = import.meta.env.BASE_URL + "fonts/";
    const [regular, bold] = await Promise.all([
      fetch(base + "NotoSans-Regular.ttf").then((r) => r.arrayBuffer()),
      fetch(base + "NotoSans-Bold.ttf").then((r) => r.arrayBuffer()),
    ]);
    const builder = await OutputPdfBuilder.create(new Uint8Array(regular), new Uint8Array(bold));

    const stage: PageStage = {
      extract: async (n) => extractPageText(await doc.getPage(n)),
      translate: async (texts, sig) => {
        try {
          const { results } = await orchestrator.translate(texts, source, target, sig);
          return results;
        } catch (e) {
          if (e instanceof GeminiQuotaError) {
            if (confirm(STR.geminiQuota)) {
              orchestrator = buildOrchestrator(false);
              refreshEngineBadge();
              const { results } = await orchestrator.translate(texts, source, target, sig);
              return results;
            }
            throw new DOMException("aborted", "AbortError");
          }
          throw e;
        }
      },
      renderMasked: async (n, blocks: Block[]) => {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        const scale = computeScale(viewport.width, viewport.height);
        const canvas = await renderPageToCanvas(page, scale);
        maskBlocks(canvas, blocks, scale);
        const pair = document.createElement("div");
        pair.className = "pair";
        if (blocks.some((b) => b.translated)) {
          const orig = await renderPageToCanvas(page, scale * 0.45);
          pair.appendChild(makePreview(orig, 450));
        }
        const jpeg = await canvasToJpeg(canvas);
        pair.appendChild(makePreview(canvas));
        previewEl.appendChild(pair);
        const out = { jpeg, widthPt: viewport.width, heightPt: viewport.height };
        canvas.width = 0; canvas.height = 0; // belleği bırak
        return out;
      },
      addPage: (jpeg, w, h, blocks) => builder.addPage(jpeg, w, h, blocks),
    };

    statusEl.textContent = STR.progress(0, pages.length);
    const result = await runPipeline(
      pages,
      stage,
      {
        onPageDone: (done, total) => {
          progressEl.value = Math.round((done / total) * 100);
          statusEl.textContent = STR.progress(done, total);
        },
      },
      signal
    );

    statusEl.textContent = STR.buildingPdf;
    outputBytes = await builder.save();
    statusEl.textContent = STR.doneMsg;
    if (result.scannedPages.length === pages.length) warn(STR.errScannedAll, true);
    else if (result.scannedPages.length > 0) warn(STR.warnScannedSome(result.scannedPages.length));
    if (result.failedBlocks > 0) warn(STR.warnFailedBlocks(result.failedBlocks));
    downloadBtn.hidden = false;
    void doc.destroy();
  } catch (e) {
    if (isAbort(e)) statusEl.textContent = STR.cancelled;
    else {
      console.error(e);
      statusEl.textContent = "";
      warn(STR.errBroken, true);
    }
  } finally {
    startBtn.disabled = false;
    cancelBtn.hidden = true;
    progressEl.hidden = true;
    abortCtrl = null;
  }
}
```

- [ ] **Step 4: Derleme ve tüm testler**

Run: `npm test` → tümü geçer. `npm run build` → hata yok.

- [ ] **Step 5: Elle uçtan uca doğrulama (tarayıcıda)**

1. `npm run dev` başlat (ya da `.claude/launch.json` ile preview sunucusu).
2. Tarayıcıda aç; İngilizce, metin tabanlı, görselli bir PDF yükle (yoksa `tests/` fixture üretme kodundan bir PDF üret ve indir).
3. Doğrula: sayfa sayısı görünür → Başlat → ilerleme artar → önizlemede çevrilmiş sayfa belirir → İndir düğmesi çalışır → inen PDF'te düzen korunmuş, çeviri seçilebilir metin.
4. Konsolda hata olmadığını doğrula (uyarı düzeyi kabul).
5. İptal düğmesini işlemin ortasında test et → durum "iptal edildi" olur, uygulama kilitlenmez.
6. Parolalı/bozuk dosya ve PDF olmayan dosya ile hata mesajlarını doğrula.

- [ ] **Step 6: Commit**

```powershell
git add -A; git commit -m "feat: add full UI wiring with live preview, cancel and download

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 15: Yayınlama — GitHub Actions + README

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: `npm run build` (Task 1). Yeni dışa aktarım yok.

- [ ] **Step 1: deploy.yml yaz**

`.github/workflows/deploy.yml`:
```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [master, main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: README.md yaz**

```markdown
# PDF Çevirmen

Ücretsiz, sınırsız, kurulumsuz PDF çeviri uygulaması. Tamamen tarayıcınızda çalışır —
PDF dosyanız hiçbir sunucuya yüklenmez.

## Özellikler
- 🔒 Gizli: dosya bilgisayarınızdan çıkmaz; yalnızca metin parçaları çeviri servisine gider
- 🖼️ Düzen korunur: çeviri, görsellerin ve sayfa düzeninin içine yerleştirilir
- ⚡ Hızlı: anahtarsız varsayılan motor; isteğe bağlı ücretsiz Gemini anahtarıyla daha yüksek kalite
- 🌍 Çok dilli: kaynak dil otomatik algılanır; onlarca hedef dil (varsayılan Türkçe)
- 💸 Tamamen ücretsiz ve açık kaynak (MIT)

## Geliştirme
```bash
npm install
npm run dev    # geliştirme sunucusu
npm test       # birim testleri
npm run build  # üretim derlemesi (dist/)
```

## Sınırlar (v1)
- Taranmış (görüntü) PDF'ler çevrilmez (OCR yok)
- Hedef dil listesi Latin/Kiril/Yunan alfabeli dillerle sınırlıdır
```

- [ ] **Step 3: Doğrula ve commit**

Run: `npm test`; `npm run build` → hata yok.

```powershell
git add -A; git commit -m "chore: add GitHub Pages deploy workflow and README

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 4: Yayın (kullanıcı GitHub deposu oluşturduktan sonra)**

Bu adım kullanıcının GitHub hesabında depo ister; depo yoksa kullanıcıya sor. `gh` varsa:
```powershell
gh repo create pdf-cevirmen --public --source . --push
```
Sonra GitHub → Settings → Pages → Source: "GitHub Actions" seçilmeli (gh ile: `gh api -X POST repos/{owner}/pdf-cevirmen/pages -f build_type=workflow` — hata verirse web arayüzünden elle). Actions sekmesinde deploy'un yeşil bittiğini ve yayın URL'sinin açıldığını doğrula.

---

## Plan Öz-Denetimi (yazım sonrası kontrol edildi)

- **Spec kapsaması:** motorlar (T7-9), yedek zincir (T8), gruplama (T4), sığdırma (T5), maskeleme/render (T11), çıktı PDF (T12), taranmış algılama (T10), hat + iptal + ilerleme (T13), UI/aralık/karşılaştırma/rapor (T14), yayın (T15). Sağlık kontrolü spec'te ayrı bir açılış adımı olarak geçer; pratikte Orchestrator'ın "boş sonuç → sıradaki motor" davranışı aynı işlevi her istekte görür — bilinçli sadeleştirme.
- **Tip tutarlılığı:** `TranslationEngine.translateBatch` her yerde `(string|null)[]` döner; `Block.translated: string|null`; `PageStage` imzaları T13 ve T14'te birebir aynı.
- **Placeholder yok:** tüm adımlarda gerçek kod/komut var.
