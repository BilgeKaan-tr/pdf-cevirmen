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
        const pair = document.createElement("div");
        pair.className = "pair";
        if (blocks.some((b) => b.translated)) {
          const orig = makePreview(canvas, 900);
          orig.className = "original";
          pair.appendChild(orig);
        }
        maskBlocks(canvas, blocks, scale);
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
