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
