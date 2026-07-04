import { describe, it, expect, vi } from "vitest";
import { GoogleGtxEngine, parseGtxResponse } from "../src/translate/google";

// gtx yanıt biçimi: [[["çeviri","orijinal",...], ...], null, "en"]
const gtxJson = (translated: string) => [[[translated, "orig", null, null, 10]], null, "en"];

function okResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function errResponse(status: number): Response {
  return { ok: false, status, json: async () => ({}) } as unknown as Response;
}

describe("parseGtxResponse", () => {
  it("segmentleri birleştirir", () => {
    const data = [[["Merhaba ", "Hello ", null], ["dünya", "world", null]], null, "en"];
    expect(parseGtxResponse(data)).toBe("Merhaba dünya");
  });
  it("bozuk yanıtta hata fırlatır", () => {
    expect(() => parseGtxResponse({ bozuk: true })).toThrow();
  });
});

describe("GoogleGtxEngine", () => {
  it("blokları çevirir ve sıraya dağıtır", async () => {
    const fetchFn = vi.fn(async () => okResponse(gtxJson("bir\niki")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0]);
    const out = await engine.translateBatch(["one", "two"], "en", "tr");
    expect(out).toEqual(["bir", "iki"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("client=gtx");
    expect(url).toContain("sl=en");
    expect(url).toContain("tl=tr");
    expect(init.method).toBe("POST");
    expect(String(init.body)).toContain(encodeURIComponent("one\ntwo"));
  });
  it("uyuşmazlıkta bloklara tek tek düşer", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(okResponse(gtxJson("hepsi birleşti tek satır")))
      .mockResolvedValueOnce(okResponse(gtxJson("bir")))
      .mockResolvedValueOnce(okResponse(gtxJson("iki")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0]);
    const out = await engine.translateBatch(["one", "two"], "en", "tr");
    expect(out).toEqual(["bir", "iki"]);
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });
  it("HTTP hatasında yeniden dener, sonra başarır", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errResponse(500))
      .mockResolvedValueOnce(okResponse(gtxJson("selam")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0]);
    const out = await engine.translateBatch(["hi"], "en", "tr");
    expect(out).toEqual(["selam"]);
  });
  it("kalıcı hatada null döner (istisna fırlatmaz)", async () => {
    const fetchFn = vi.fn(async () => errResponse(500));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0]);
    const out = await engine.translateBatch(["hi"], "en", "tr");
    expect(out).toEqual([null]);
  });
  // sahte saat: sleep süreleri kaydedilir ve zaman ilerletilir (gerçek bekleme yok)
  const fastOpts = (sleeps: number[]) => {
    let t = 0;
    return {
      minIntervalMs: 0,
      now: () => t,
      sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
    };
  };

  it("429'da bekler, sonra yeniden dener ve başarır", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errResponse(429))
      .mockResolvedValueOnce(okResponse(gtxJson("selam")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0], fastOpts(sleeps));
    const out = await engine.translateBatch(["hi"], "en", "tr");
    expect(out).toEqual(["selam"]);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(sleeps).toContain(10000);
  });
  it("art arda 429'larda bekleme süresi artar", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errResponse(429))
      .mockResolvedValueOnce(errResponse(429))
      .mockResolvedValueOnce(errResponse(429))
      .mockResolvedValueOnce(okResponse(gtxJson("selam")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0], fastOpts(sleeps));
    const out = await engine.translateBatch(["hi"], "en", "tr");
    expect(out).toEqual(["selam"]);
    expect(sleeps).toEqual(expect.arrayContaining([10000, 30000, 60000]));
  });
  it("429 hiç düzelmezse null döner ve deneme sayısı sınırlı kalır", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi.fn(async () => errResponse(429));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0], fastOpts(sleeps));
    const out = await engine.translateBatch(["hi"], "en", "tr");
    expect(out).toEqual([null]);
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(10);
  });
  it("CORS'suz engel (ağ hatası) da hız sınırı gibi bekletilir", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(okResponse(gtxJson("selam")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0], fastOpts(sleeps));
    const out = await engine.translateBatch(["hi"], "en", "tr");
    expect(out).toEqual(["selam"]);
    expect(sleeps).toContain(10000);
  });
  it("beklemeler tükenince motor kapanır, sonraki çağrılar ağa çıkmaz", async () => {
    const sleeps: number[] = [];
    const fetchFn = vi.fn(async () => errResponse(429));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0], fastOpts(sleeps));
    await engine.translateBatch(["hi"], "en", "tr");
    fetchFn.mockClear();
    const out = await engine.translateBatch(["merhaba", "dünya"], "en", "tr");
    expect(out).toEqual([null, null]);
    expect(fetchFn).not.toHaveBeenCalled();
  });
  it("bekleme başlarken onWait geri çağrısı tetiklenir", async () => {
    const sleeps: number[] = [];
    const waits: number[] = [];
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errResponse(429))
      .mockResolvedValueOnce(okResponse(gtxJson("selam")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0], {
      ...fastOpts(sleeps),
      onWait: (ms) => waits.push(ms),
    });
    await engine.translateBatch(["hi"], "en", "tr");
    expect(waits).toEqual([10000]);
  });
});
