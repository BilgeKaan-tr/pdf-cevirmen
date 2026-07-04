import { RateLimitError, type TranslationEngine } from "../types";
import { runBatch } from "./batch";
import { isAbort } from "../util";
import { Cooldown } from "./cooldown";

export interface LingvaOpts {
  now?: () => number;
  onWait?: (ms: number) => void;
}

export class LingvaEngine implements TranslationEngine {
  readonly id = "lingva" as const;
  private cooldown: Cooldown;

  constructor(
    private instances: string[] = ["https://lingva.ml", "https://translate.plausibility.cloud"],
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private retryDelays: number[] = [1000, 2000],
    opts: LingvaOpts = {}
  ) {
    this.cooldown = new Cooldown({ now: opts.now, onWait: opts.onWait });
  }

  private async request(text: string, source: string, target: string, signal?: AbortSignal): Promise<string> {
    if (this.cooldown.isBlocked()) throw new RateLimitError();
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
        this.cooldown.reset();
        return data.translation;
      } catch (e) {
        if (isAbort(e)) throw e;
        lastErr = e;
      }
    }
    // tüm örnekler bu istekte başarısız oldu: geçici olarak soğumaya al,
    // kalıcı değil — pencere kapanınca bir sonraki çağrı yeniden dener
    this.cooldown.escalate();
    throw lastErr;
  }

  translateBatch(texts: string[], source: string, target: string, signal?: AbortSignal) {
    return runBatch(texts, (t) => this.request(t, source, target, signal), {
      concurrency: 3,
      retryDelays: this.retryDelays,
      signal,
      retryIf: (e) => !(e instanceof RateLimitError),
    });
  }
}
