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
