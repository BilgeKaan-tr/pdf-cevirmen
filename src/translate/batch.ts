import { makeChunks, splitTranslated } from "./chunking";
import { mapPool, withRetry, isAbort } from "../util";

export interface BatchOpts {
  concurrency: number;
  retryDelays: number[];
  signal?: AbortSignal;
  retryIf?: (e: unknown) => boolean;
}

/**
 * Ortak toplu çeviri kalıbı: blokları parçalara paketler, paralel çevirir,
 * uyuşmazlık ya da parça hatasında bloklara tek tek düşer.
 * Blok bazında başarısızlık null olarak döner — asla istisna sızdırmaz (abort hariç).
 */
export async function runBatch(
  texts: string[],
  request: (text: string) => Promise<string>,
  opts: BatchOpts
): Promise<(string | null)[]> {
  const { concurrency, retryDelays, signal, retryIf } = opts;
  const chunks = makeChunks(texts);
  const out: (string | null)[] = new Array(texts.length).fill(null);
  await mapPool(chunks, concurrency, async (chunk) => {
    let parts: string[] | null = null;
    try {
      const translated = await withRetry(() => request(chunk.text), { delays: retryDelays, signal, retryIf });
      parts = splitTranslated(chunk, translated);
    } catch (e) {
      if (isAbort(e)) throw e;
    }
    if (parts) {
      chunk.indices.forEach((blockIdx, j) => { out[blockIdx] = parts![j]; });
      return;
    }
    for (const blockIdx of chunk.indices) {
      try {
        out[blockIdx] = await withRetry(() => request(texts[blockIdx]), { delays: retryDelays, signal, retryIf });
      } catch (e) {
        if (isAbort(e)) throw e;
        out[blockIdx] = null;
      }
    }
  });
  return out;
}
