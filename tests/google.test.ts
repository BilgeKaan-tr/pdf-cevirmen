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
  const fakeClock = () => {
    let t = 0;
    return { now: () => t, advance: (ms: number) => { t += ms; } };
  };

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

  it("kalıcı 5xx hatada null döner (istisna fırlatmaz)", async () => {
    const fetchFn = vi.fn(async () => errResponse(500));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0]);
    const out = await engine.translateBatch(["hi"], "en", "tr");
    expect(out).toEqual([null]);
  });

  it("429'da o istek başarısız olur ama motor KALICI kapanmaz — pencere geçince tekrar dener", async () => {
    const clock = fakeClock();
    const onWait = vi.fn();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errResponse(429))
      .mockResolvedValueOnce(okResponse(gtxJson("selam")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0], {
      now: clock.now,
      onWait,
    });
    const first = await engine.translateBatch(["hi"], "en", "tr");
    expect(first).toEqual([null]); // engel penceresi açıldı, bu istek boşa gitmedi ama başarısız sayıldı
    expect(onWait).toHaveBeenCalledWith(10_000);

    // pencere kapanmadan yeni çağrı: ağa hiç çıkmadan null döner (hızlı vazgeçiş)
    fetchFn.mockClear();
    const stillBlocked = await engine.translateBatch(["hi"], "en", "tr");
    expect(stillBlocked).toEqual([null]);
    expect(fetchFn).not.toHaveBeenCalled();

    // pencere geçince tekrar gerçek istek atar ve bu sefer başarır
    clock.advance(10_000);
    const after = await engine.translateBatch(["hi"], "en", "tr");
    expect(after).toEqual(["selam"]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("art arda 429'larda bekleme kademeli büyür ama asla vazgeçmez", async () => {
    const clock = fakeClock();
    const onWait = vi.fn();
    const fetchFn = vi.fn(async () => errResponse(429));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0], {
      now: clock.now,
      onWait,
    });
    await engine.translateBatch(["hi"], "en", "tr");
    clock.advance(10_000);
    await engine.translateBatch(["hi"], "en", "tr");
    expect(onWait).toHaveBeenCalledWith(30_000);
    clock.advance(30_000);
    await engine.translateBatch(["hi"], "en", "tr");
    expect(onWait).toHaveBeenCalledWith(60_000);
    clock.advance(60_000);
    await engine.translateBatch(["hi"], "en", "tr");
    expect(onWait).toHaveBeenCalledWith(120_000);
    // çok sonra bile hâlâ 120s tavanında deneyebiliyor — kalıcı ölüm yok
    clock.advance(120_000);
    onWait.mockClear();
    await engine.translateBatch(["hi"], "en", "tr");
    expect(onWait).toHaveBeenCalledWith(120_000);
  });

  it("CORS'suz engel (ağ hatası) da hız sınırı gibi ele alınır", async () => {
    const clock = fakeClock();
    const onWait = vi.fn();
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(okResponse(gtxJson("selam")));
    const engine = new GoogleGtxEngine("https://x", fetchFn as unknown as typeof fetch, [0], {
      now: clock.now,
      onWait,
    });
    const first = await engine.translateBatch(["hi"], "en", "tr");
    expect(first).toEqual([null]);
    expect(onWait).toHaveBeenCalledWith(10_000);
    clock.advance(10_000);
    const after = await engine.translateBatch(["hi"], "en", "tr");
    expect(after).toEqual(["selam"]);
  });
});
