import { RateLimitError, type TranslationEngine } from "../types";
import { runBatch } from "./batch";
import { sleepAbortable, isAbort } from "../util";

export function parseGtxResponse(data: unknown): string {
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error("beklenmeyen gtx yanıtı");
  }
  return (data[0] as unknown[])
    .map((seg) => (Array.isArray(seg) && typeof seg[0] === "string" ? seg[0] : ""))
    .join("");
}

export interface GtxOpts {
  /** İki istek başlangıcı arasındaki en küçük süre (429'u tetiklememek için). */
  minIntervalMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  /** Hız sınırı beklemesi başladığında çağrılır (UI durum mesajı için). */
  onWait?: (ms: number) => void;
}

// Google 429 döndürdüğünde kalıcı olarak vazgeçmek yerine artan sürelerle
// beklenir ve kaldığı yerden devam edilir. Not: tarayıcıda Google'ın engel
// sayfası CORS başlığı taşımadığından 429 yerine ağ hatası görünür; ikisi de
// aynı bekleme yoluna girer (çevrimdışılıkta da beklemek doğru davranıştır).
// Tüm beklemeler tükendiyse motor bu çalışma için kapanır ve hızla null döner;
// pipeline'daki güvenlik ağı kullanıcıyı bilgilendirir.
const COOLDOWNS_MS = [10_000, 30_000, 60_000, 120_000];
const MAX_RATE_WAITS = 4;

export class GoogleGtxEngine implements TranslationEngine {
  readonly id = "google" as const;
  private blockedUntil = 0;
  private cooldownIdx = 0;
  private nextSlot = 0;
  private exhausted = false;
  private minIntervalMs: number;
  private sleepFn: (ms: number, signal?: AbortSignal) => Promise<void>;
  private now: () => number;
  private onWait?: (ms: number) => void;

  constructor(
    private baseUrl = "https://translate.googleapis.com",
    private fetchFn: typeof fetch = (...a) => fetch(...a),
    private retryDelays: number[] = [1000, 2000, 4000],
    opts: GtxOpts = {}
  ) {
    this.minIntervalMs = opts.minIntervalMs ?? 250;
    this.sleepFn = opts.sleep ?? sleepAbortable;
    this.now = opts.now ?? Date.now;
    this.onWait = opts.onWait;
  }

  /** Sıra bekletme: hem hız sınırı engelini hem istekler arası aralığı uygular. */
  private async waitTurn(signal?: AbortSignal): Promise<void> {
    for (;;) {
      const now = this.now();
      const startAt = Math.max(this.blockedUntil, this.nextSlot);
      if (startAt <= now) {
        this.nextSlot = now + this.minIntervalMs;
        return;
      }
      await this.sleepFn(startAt - now, signal);
    }
  }

  /** Bekleme penceresini büyüt. Aynı pencere içindeki eşzamanlı hatalar kademeyi katlamaz. */
  private escalate(): void {
    if (this.now() < this.blockedUntil) return;
    const cd = COOLDOWNS_MS[Math.min(this.cooldownIdx, COOLDOWNS_MS.length - 1)];
    this.cooldownIdx++;
    this.blockedUntil = this.now() + cd;
    this.onWait?.(cd);
  }

  private async request(text: string, source: string, target: string, signal?: AbortSignal): Promise<string> {
    if (this.exhausted) throw new RateLimitError();
    const url = `${this.baseUrl}/translate_a/single?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&dt=t`;
    for (let attempt = 0; attempt <= MAX_RATE_WAITS; attempt++) {
      await this.waitTurn(signal);
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
        this.escalate(); // CORS'suz engel sayfası / ağ kesintisi: bekle ve yeniden dene
        continue;
      }
      if (res.status === 429) {
        this.escalate();
        continue;
      }
      if (!res.ok) throw new Error(`gtx HTTP ${res.status}`);
      this.cooldownIdx = 0;
      return parseGtxResponse(await res.json());
    }
    this.exhausted = true;
    throw new RateLimitError();
  }

  translateBatch(texts: string[], source: string, target: string, signal?: AbortSignal) {
    if (this.exhausted) return Promise.resolve(texts.map(() => null));
    return runBatch(texts, (t) => this.request(t, source, target, signal), {
      concurrency: 4,
      retryDelays: this.retryDelays,
      signal,
      retryIf: (e) => !(e instanceof RateLimitError),
    });
  }
}
