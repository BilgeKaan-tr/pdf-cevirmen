import type { TranslationEngine } from "../types";
import { runBatch } from "./batch";
import { isAbort } from "../util";

export class LingvaEngine implements TranslationEngine {
  readonly id = "lingva" as const;
  // Tüm örnekler bir kez topluca başarısız olursa (genelde arka planda
  // Google'ın kendisi engellenmiştir) devre açılır; kalan çalışma boyunca
  // her sayfada aynı yavaş çok-örnek denemesi tekrarlanmaz.
  private circuitOpen = false;

  constructor(
    private instances: string[] = ["https://lingva.ml", "https://translate.plausibility.cloud"],
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private retryDelays: number[] = [1000, 2000]
  ) {}

  private async request(text: string, source: string, target: string, signal?: AbortSignal): Promise<string> {
    if (this.circuitOpen) throw new Error("lingva devre dışı (art arda hata)");
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
    this.circuitOpen = true;
    throw lastErr;
  }

  translateBatch(texts: string[], source: string, target: string, signal?: AbortSignal) {
    if (this.circuitOpen) return Promise.resolve(texts.map(() => null));
    return runBatch(texts, (t) => this.request(t, source, target, signal), {
      concurrency: 3,
      retryDelays: this.retryDelays,
      signal,
    });
  }
}
