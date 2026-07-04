export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export interface RetryOpts {
  delays?: number[];
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  retryIf?: (e: unknown) => boolean;
}

/** İptal sinyaline saygılı bekleme: abort edilirse AbortError ile reddeder. */
export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("aborted", "AbortError"));
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("aborted", "AbortError"));
    };
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const { delays = [1000, 2000, 4000], signal, retryIf = () => true } = opts;
  // varsayılan bekleme iptale saygılıdır: kullanıcı iptal edince anında durur
  const sleep = opts.sleep ?? ((ms: number) => sleepAbortable(ms, signal));
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    try {
      return await fn();
    } catch (e) {
      if (isAbort(e) || !retryIf(e)) throw e;
      lastErr = e;
      if (attempt < delays.length) await sleep(delays[attempt]);
    }
  }
  throw lastErr;
}
