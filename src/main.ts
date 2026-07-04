import { registerSW } from "virtual:pwa-register";
import { STR, SOURCE_LANGS, TARGET_LANGS } from "./strings";

registerSW({ immediate: true });
import type { Block, TranslationEngine } from "./types";
import { PdfPasswordError, TranslationUnavailableError } from "./types";
import { loadPdf, extractPageText } from "./pdf/extract";
import {
  computeScale, renderPageToCanvas, maskBlocks, canvasToJpeg, makePreview, drawTranslations,
} from "./pdf/render";
import { OutputPdfBuilder } from "./pdf/build";
import { GoogleGtxEngine } from "./translate/google";
import { LingvaEngine } from "./translate/lingva";
import { GeminiEngine } from "./translate/gemini";
import { Orchestrator } from "./translate/orchestrator";
import { getGeminiKey, setGeminiKey } from "./translate/settings";
import { runPipeline, type PageStage } from "./pipeline";
import { isAbort } from "./util";
import { OcrManager } from "./ocr/manager";
import { getOcrLang, ocrParagraphsToBlocks } from "./ocr/ocr";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`eleman yok: ${id}`);
  return el as T;
};

// --- statik metinleri bağla ---
document.title = `${STR.appName} — Ücretsiz PDF Çevirisi`;
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
$("ocr-label").textContent = STR.ocrFigures;
$("footer-privacy").textContent = STR.footerPrivacy;
$("footer-oss").textContent = STR.footerOpenSource;
$("footer-version").textContent = STR.footerVersion;

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
  $("work-screen").hidden = false;
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
    statusEl.textContent = `${file.name} — ${pageCount} sayfa`;
    startBtn.disabled = false;
  } catch (e) {
    pdfBytes = null;
    statusEl.textContent = "";
    $("work-screen").hidden = true;
    warn(e instanceof PdfPasswordError ? STR.errPassword : STR.errBroken, true);
  }
}

// --- motor kurulumu ---
function buildOrchestrator(includeGemini: boolean, onWait?: (ms: number) => void): Orchestrator {
  const engines: TranslationEngine[] = [];
  const key = getGeminiKey();
  if (includeGemini && key) engines.push(new GeminiEngine(key));
  engines.push(new GoogleGtxEngine(undefined, undefined, undefined, { onWait }), new LingvaEngine());
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

  // hız sınırı beklemesini kullanıcıya bildir
  const showWait = (ms: number) => {
    statusEl.textContent = STR.waitingRateLimit(Math.round(ms / 1000));
  };
  const orchestrator = buildOrchestrator(true, showWait);
  const source = sourceSel.value;
  const target = targetSel.value;
  // dev işlerde bellek ve çıktı boyutunu dizginle
  const bigJob = pages.length > 150;
  const ocrFigures = $<HTMLInputElement>("ocr-toggle").checked;
  const ocrManager = new OcrManager();
  let ocrFailedPages = 0;
  let ocrEngineReady = false;

  let builder: OutputPdfBuilder | null = null;
  try {
    const doc = await loadPdf(pdfBytes.slice(0));
    const base = import.meta.env.BASE_URL + "fonts/";
    const [regular, bold] = await Promise.all([
      fetch(base + "NotoSans-Regular.ttf").then((r) => r.arrayBuffer()),
      fetch(base + "NotoSans-Bold.ttf").then((r) => r.arrayBuffer()),
    ]);
    builder = await OutputPdfBuilder.create(new Uint8Array(regular), new Uint8Array(bold));
    const pdfBuilder = builder;

    const stage: PageStage = {
      extract: async (n) => extractPageText(await doc.getPage(n)),
      translate: async (texts, sig) => {
        // Her motor kendi soğuma penceresini kendi yönetir (Gemini kotası,
        // Google/Lingva hız sınırı) — hiçbiri kalıcı vazgeçmez, pencere
        // kapanınca sonraki sayfada kendiliğinden yeniden denenir.
        const { results } = await orchestrator.translate(texts, source, target, sig);
        return results;
      },
      ocr: async (n) => {
        if (!ocrEngineReady) {
          statusEl.textContent = STR.ocrPreparing;
        }
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        let scale = computeScale(viewport.width, viewport.height);
        if (bigJob) scale = Math.min(scale, 1.4);
        const canvas = await renderPageToCanvas(page, scale);
        try {
          const paras = await ocrManager.recognize(canvas, getOcrLang(source));
          ocrEngineReady = true;
          return ocrParagraphsToBlocks(paras, scale);
        } catch (e) {
          console.error("OCR hatası:", e);
          ocrFailedPages++;
          return [];
        } finally {
          canvas.width = 0; canvas.height = 0;
        }
      },
      renderMasked: async (n, blocks: Block[]) => {
        const page = await doc.getPage(n);
        const viewport = page.getViewport({ scale: 1 });
        let scale = computeScale(viewport.width, viewport.height);
        if (bigJob) scale = Math.min(scale, 1.4);
        const canvas = await renderPageToCanvas(page, scale);
        const pair = document.createElement("div");
        pair.className = "pair";
        if (blocks.some((b) => b.translated)) {
          const orig = makePreview(canvas, 700);
          orig.className = "original";
          pair.appendChild(orig);
        }
        maskBlocks(canvas, blocks, scale);
        const jpeg = await canvasToJpeg(canvas, bigJob ? 0.8 : 0.85);
        drawTranslations(canvas, blocks, scale);
        pair.appendChild(makePreview(canvas, bigJob ? 700 : 900));
        previewEl.appendChild(pair);
        // uzun kitaplarda DOM'da yalnızca son sayfalar kalsın (bellek)
        while (previewEl.children.length > 6) previewEl.removeChild(previewEl.firstChild as Node);
        const out = { jpeg, widthPt: viewport.width, heightPt: viewport.height };
        canvas.width = 0; canvas.height = 0; // belleği bırak
        return out;
      },
      addPage: (jpeg, w, h, blocks) => pdfBuilder.addPage(jpeg, w, h, blocks),
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
        onOcrPage: (n) => {
          statusEl.textContent = STR.ocrReading(n);
        },
      },
      signal,
      { ocrFigures }
    );

    statusEl.textContent = STR.buildingPdf;
    outputBytes = await pdfBuilder.save();
    statusEl.textContent = STR.doneMsg;
    if (result.scannedPages.length === pages.length) warn(STR.errScannedAll, true);
    else if (result.scannedPages.length > 0) warn(STR.warnScannedSome(result.scannedPages.length));
    if (result.failedBlocks > 0) warn(STR.warnFailedBlocks(result.failedBlocks));
    if (ocrFailedPages > 0) warn(STR.warnOcrFailed(ocrFailedPages));
    downloadBtn.hidden = false;
    void doc.destroy();
  } catch (e) {
    if (isAbort(e)) statusEl.textContent = STR.cancelled;
    else if (e instanceof TranslationUnavailableError && builder) {
      // servis erişilemez: o ana kadarki sayfaları kısmî çıktı olarak sun,
      // sayfa aralığını kaldığı yerden devam edecek şekilde önceden doldur
      outputBytes = await builder.save();
      statusEl.textContent = "";
      warn(STR.errServiceDown, true);
      downloadBtn.hidden = false;
      rangeFrom.value = String(Math.min(pageCount, e.stoppedAtPage + 1));
    } else {
      console.error(e);
      statusEl.textContent = "";
      warn(STR.errBroken, true);
    }
  } finally {
    startBtn.disabled = false;
    cancelBtn.hidden = true;
    progressEl.hidden = true;
    abortCtrl = null;
    void ocrManager.dispose();
  }
}
