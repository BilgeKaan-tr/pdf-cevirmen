import { RateLimitError, type TranslationEngine } from "../types";
import { runBatch } from "./batch";
import { isAbort, sleepAbortable } from "../util";
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
  /** İki istek başlangıcı arasındaki en küçük süre; engel tetiklememek için tempo. */
  minIntervalMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export class GoogleGtxEngine implements TranslationEngine {
  readonly id = "google" as const;
  private cooldown: Cooldown;
  private minIntervalMs: number;
  private sleepFn: (ms: number, signal?: AbortSignal) => Promise<void>;
  private now: () => number;
  private nextSlot = 0;

  constructor(
    private baseUrl = "https://translate.googleapis.com",
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private retryDelays: number[] = [1000, 2000, 4000],
    opts: GtxOpts = {}
  ) {
    this.cooldown = new Cooldown({ now: opts.now, onWait: opts.onWait });
    // Anahtarsız gtx resmi bir API değil; çok hızlı ardışık istek atınca Google
    // IP'yi geçici olarak engeller (ve bu engel çok uzun sürebilir). Nazik bir
    // tempo (varsayılan sayfa başına ~1 sn) engeli baştan önler.
    this.minIntervalMs = opts.minIntervalMs ?? 1000;
    this.sleepFn = opts.sleep ?? sleepAbortable;
    this.now = opts.now ?? Date.now;
  }

  /** İstek başlangıçlarını minInterval'a göre serileştirir (paralel çağrılar sıraya girer). */
  private async pace(signal?: AbortSignal): Promise<void> {
    const now = this.now();
    const start = Math.max(now, this.nextSlot);
    this.nextSlot = start + this.minIntervalMs;
    const wait = start - now;
    if (wait > 0) await this.sleepFn(wait, signal);
  }

  private async request(text: string, source: string, target: string, signal?: AbortSignal): Promise<string> {
    // Not: Google'ın engel sayfası CORS başlığı taşımadığından tarayıcıda 429
    // yerine ağ hatası (TypeError) görünebilir; ikisi de aynı soğuma yoluna girer.
    if (this.cooldown.isBlocked()) throw new RateLimitError();
    await this.pace(signal);
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
      concurrency: 2,
      retryDelays: this.retryDelays,
      signal,
      retryIf: (e) => !(e instanceof RateLimitError),
    });
  }
}
