import { describe, it, expect, vi } from "vitest";
import { LingvaEngine } from "../src/translate/lingva";
import { Orchestrator } from "../src/translate/orchestrator";
import { GeminiQuotaError, type TranslationEngine } from "../src/types";

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
  it("tüm örnekler çökerse devre kesici açılır, sonraki çağrı ağa gitmez", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    const engine = new LingvaEngine(["https://a", "https://b"], fetchFn as unknown as typeof fetch, [0]);
    await engine.translateBatch(["hello"], "auto", "tr");
    fetchFn.mockClear();
    const out = await engine.translateBatch(["merhaba"], "auto", "tr");
    expect(out).toEqual([null]);
    expect(fetchFn).not.toHaveBeenCalled();
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
  it("GeminiQuotaError yukarı fırlar (UI karar verir)", async () => {
    const e1 = fakeEngine("gemini", async () => { throw new GeminiQuotaError(); });
    const e2 = fakeEngine("google", async (t) => t.map(() => "x"));
    await expect(new Orchestrator([e1, e2]).translate(["a"], "en", "tr")).rejects.toBeInstanceOf(GeminiQuotaError);
  });
  it("tüm motorlar çökerse null dizisi döner", async () => {
    const e1 = fakeEngine("google", async () => { throw new Error("1"); });
    const e2 = fakeEngine("lingva", async () => { throw new Error("2"); });
    const { results } = await new Orchestrator([e1, e2]).translate(["a", "b"], "en", "tr");
    expect(results).toEqual([null, null]);
  });
});
