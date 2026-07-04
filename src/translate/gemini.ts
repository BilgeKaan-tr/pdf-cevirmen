import type { TranslationEngine } from "../types";
import { withRetry, isAbort } from "../util";
import { Cooldown } from "./cooldown";

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

class GeminiRateLimited extends Error {
  constructor() { super("gemini rate limited"); this.name = "GeminiRateLimited"; }
}

export interface GeminiOpts {
  now?: () => number;
  onWait?: (ms: number) => void;
}

export class GeminiEngine implements TranslationEngine {
  readonly id = "gemini" as const;
  private lastRequestAt = 0;
  private cooldown: Cooldown;

  constructor(
    private apiKey: string,
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private minIntervalMs = 4500,
    private sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private retryDelays: number[] = [2000, 5000],
    opts: GeminiOpts = {}
  ) {
    this.cooldown = new Cooldown({ now: opts.now, onWait: opts.onWait });
  }

  private async request(prompt: string, signal?: AbortSignal): Promise<string> {
    if (this.cooldown.isBlocked()) throw new GeminiRateLimited();
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
    if (res.status === 429) {
      this.cooldown.escalate();
      throw new GeminiRateLimited();
    }
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    if (text.length === 0) throw new Error("boş Gemini yanıtı");
    this.cooldown.reset();
    return text;
  }

  private retryOpts(signal?: AbortSignal) {
    return {
      delays: this.retryDelays,
      signal,
      retryIf: (e: unknown) => !(e instanceof GeminiRateLimited),
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
      // Soğuma penceresi açıkken bu ve sonraki gruplar için ağa hiç çıkma —
      // bir sonraki sayfa/çağrı pencere kapanınca kendiliğinden yeniden dener.
      if (this.cooldown.isBlocked()) break;

      const groupTexts = group.map((i) => texts[i]);
      let parts: string[] | null = null;
      try {
        const raw = await withRetry(
          () => this.request(buildGeminiPrompt(groupTexts, source, target), signal),
          this.retryOpts(signal)
        );
        parts = parseGeminiResponse(raw, groupTexts.length);
      } catch (e) {
        if (isAbort(e)) throw e;
        if (e instanceof GeminiRateLimited) continue; // sıradaki grup da bloklu olacak, döngü kendi kontrol eder
      }
      if (parts) {
        group.forEach((blockIdx, j) => { out[blockIdx] = parts![j]; });
        continue;
      }
      for (let j = 0; j < group.length; j++) {
        if (this.cooldown.isBlocked()) break;
        try {
          const raw = await withRetry(
            () => this.request(buildGeminiPrompt([groupTexts[j]], source, target), signal),
            this.retryOpts(signal)
          );
          const single = parseGeminiResponse(raw, 1);
          out[group[j]] = single ? single[0] : null;
        } catch (e) {
          if (isAbort(e)) throw e;
          out[group[j]] = null;
        }
      }
    }
    return out;
  }
}
