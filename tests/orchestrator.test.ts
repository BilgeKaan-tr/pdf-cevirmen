import { describe, it, expect, vi } from "vitest";
import { LingvaEngine } from "../src/translate/lingva";
import { Orchestrator } from "../src/translate/orchestrator";
import type { TranslationEngine } from "../src/types";

function fakeEngine(id: "google" | "lingva" | "gemini", impl: TranslationEngine["translateBatch"]): TranslationEngine {
  return { id, translateBatch: impl };
}

describe("LingvaEngine", () => {
  it("ilk örnek çökerse ikinci örneğe geçer", async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("bağlantı yok"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ translation: "merhaba" }) });
    const engine = new LingvaEngine(["https://a", "https://b"], fetchFn as unknown as typeof fetch, [0]);
    const out = await engine.translateBatch(["hello"], "auto", "tr");
    expect(out).toEqual(["merhaba"]);
    expect(String(fetchFn.mock.calls[1][0])).toContain("https://b/api/v1/auto/tr/hello");
  });
  it("tüm örnekler çökerse geçici soğumaya girer, KALICI kapanmaz", async () => {
    let t = 0;
    const fetchFn = vi
      .fn()
      .mockImplementation(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const engine = new LingvaEngine(["https://a", "https://b"], fetchFn as unknown as typeof fetch, [0], {
      now: () => t,
    });
    await engine.translateBatch(["hello"], "auto", "tr");
    fetchFn.mockClear();
    // soğuma penceresi açıkken: ağa hiç çıkmadan null döner
    const blocked = await engine.translateBatch(["merhaba"], "auto", "tr");
    expect(blocked).toEqual([null]);
    expect(fetchFn).not.toHaveBeenCalled();
    // pencere geçince tekrar dener
    t += 10_000;
    fetchFn.mockResolvedValue({ ok: true, status: 200, json: async () => ({ translation: "tamam" }) });
    const after = await engine.translateBatch(["merhaba"], "auto", "tr");
    expect(after).toEqual(["tamam"]);
  });
});

describe("Orchestrator", () => {
  it("ilk motor sonuç veriyorsa onu kullanır", async () => {
    const e1 = fakeEngine("google", async (t) => t.map(() => "ç1"));
    const e2 = fakeEngine("lingva", async (t) => t.map(() => "ç2"));
    const { results, engineId } = await new Orchestrator([e1, e2]).translate(["a"], "en", "tr");
    expect(results).toEqual(["ç1"]);
    expect(engineId).toBe("google");
  });
  it("ilk motor tamamen boş dönerse ikinciye düşer", async () => {
    const e1 = fakeEngine("google", async (t) => t.map(() => null));
    const e2 = fakeEngine("lingva", async (t) => t.map(() => "yedek"));
    const { results, engineId } = await new Orchestrator([e1, e2]).translate(["a", "b"], "en", "tr");
    expect(results).toEqual(["yedek", "yedek"]);
    expect(engineId).toBe("lingva");
  });
  it("ilk motor istisna fırlatırsa ikinciye düşer", async () => {
    const e1 = fakeEngine("google", async () => { throw new Error("çöktü"); });
    const e2 = fakeEngine("lingva", async (t) => t.map(() => "yedek"));
    const { results } = await new Orchestrator([e1, e2]).translate(["a"], "en", "tr");
    expect(results).toEqual(["yedek"]);
  });
  it("bir motor istisna fırlatırsa (kota vb.) sıradaki motora sessizce geçer", async () => {
    const e1 = fakeEngine("gemini", async () => { throw new Error("kota doldu"); });
    const e2 = fakeEngine("google", async (t) => t.map(() => "x"));
    const { results, engineId } = await new Orchestrator([e1, e2]).translate(["a"], "en", "tr");
    expect(results).toEqual(["x"]);
    expect(engineId).toBe("google");
  });
  it("tüm motorlar çökerse null dizisi döner", async () => {
    const e1 = fakeEngine("google", async () => { throw new Error("1"); });
    const e2 = fakeEngine("lingva", async () => { throw new Error("2"); });
    const { results } = await new Orchestrator([e1, e2]).translate(["a", "b"], "en", "tr");
    expect(results).toEqual([null, null]);
  });
});
