import { describe, it, expect, vi } from "vitest";
import { buildGeminiPrompt, parseGeminiResponse, GeminiEngine } from "../src/translate/gemini";
import { GeminiQuotaError } from "../src/types";

const geminiOk = (text: string) => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});

describe("buildGeminiPrompt", () => {
  it("işaretleyicilerle numaralar", () => {
    const p = buildGeminiPrompt(["Hello", "World"], "en", "tr");
    expect(p).toContain("⟦0⟧Hello");
    expect(p).toContain("⟦1⟧World");
    expect(p.toLowerCase()).toContain('"tr"');
  });
});

describe("parseGeminiResponse", () => {
  it("işaretleyicileri ayrıştırır", () => {
    expect(parseGeminiResponse("⟦0⟧Merhaba\n⟦1⟧Dünya", 2)).toEqual(["Merhaba", "Dünya"]);
  });
  it("eksik işaretleyicide null döner", () => {
    expect(parseGeminiResponse("⟦0⟧Merhaba", 2)).toBeNull();
  });
});

describe("GeminiEngine", () => {
  const fastEngine = (fetchFn: unknown, key = "KEY") =>
    new GeminiEngine(key, fetchFn as never, 0, async () => {}, [0]);

  it("toplu çevirir", async () => {
    const fetchFn = vi.fn(async () => geminiOk("⟦0⟧bir\n⟦1⟧iki"));
    const out = await fastEngine(fetchFn).translateBatch(["one", "two"], "en", "tr");
    expect(out).toEqual(["bir", "iki"]);
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain("gemini-flash-latest:generateContent");
    expect(url).toContain("key=KEY");
  });
  it("bozuk yanıtta bloklara tek tek düşer", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(geminiOk("işaretleyiciler kayboldu"))
      .mockResolvedValueOnce(geminiOk("⟦0⟧bir"))
      .mockResolvedValueOnce(geminiOk("⟦0⟧iki"));
    const out = await fastEngine(fetchFn).translateBatch(["one", "two"], "en", "tr");
    expect(out).toEqual(["bir", "iki"]);
  });
  it("429'da GeminiQuotaError fırlatır", async () => {
    const fetchFn = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    await expect(fastEngine(fetchFn).translateBatch(["x"], "en", "tr"))
      .rejects.toBeInstanceOf(GeminiQuotaError);
  });
});

describe("settings", () => {
  it("localStorage yokken çökmez", async () => {
    const { getGeminiKey, setGeminiKey } = await import("../src/translate/settings");
    expect(getGeminiKey()).toBe("");
    expect(() => setGeminiKey("abc")).not.toThrow();
  });
});
