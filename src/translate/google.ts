import { RateLimitError, type TranslationEngine } from "../types";
import { runBatch } from "./batch";
import { isAbort } from "../util";
import { Cooldown } from "./cooldown";

export function parseGtxResponse(data: unknown): string {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("beklenmeyen gtx yanıtı");
  }
  return (data[0] as unknown[])
    .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
    .join("");
}

export interface GtxOpts {
  now?: () => number;
  /** Yeni bir hız-sınırı penceresi açıldığında çağrılır (UI durum mesajı için). */
  onWait?: (ms: number) => void;
}

export class GoogleGtxEngine implements TranslationEngine {
  readonly id = "google" as const;
  private cooldown: Cooldown;

  constructor(
    private baseUrl = "https://translate.googleapis.com",
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private retryDelays: number[] = [1000, 2000, 4000],
    opts: GtxOpts = {}
  ) {
    this.cooldown = new Cooldown({ now: opts.now, onWait: opts.onWait });
  }

  private async request(text: string, source: string, target: string, signal?: AbortSignal): Promise<string> {
    // Not: Google'ın engel sayfası CORS başlığı taşımadığından tarayıcıda 429
    // yerine ağ hatası (TypeError) görünebilir; ikisi de aynı soğuma yoluna girer.
    if (this.cooldown.isBlocked()) throw new RateLimitError();
    const url = `${this.baseUrl}/translate_a/single?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&dt=t`;
    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
        body: "q=" + encodeURIComponent(text),
        signal,
      });
    } catch (e) {
      if (isAbort(e)) throw e;
      this.cooldown.escalate();
      throw new RateLimitError();
    }
    if (res.status === 429) {
      this.cooldown.escalate();
      throw new RateLimitError();
    }
    if (!res.ok) throw new Error(`gtx HTTP ${res.status}`);
    this.cooldown.reset();
    return parseGtxResponse(await res.json());
  }

  translateBatch(texts: string[], source: string, target: string, signal?: AbortSignal) {
    return runBatch(texts, (t) => this.request(t, source, target, signal), {
      concurrency: 4,
      retryDelays: this.retryDelays,
      signal,
      retryIf: (e) => !(e instanceof RateLimitError),
    });
  }
}
