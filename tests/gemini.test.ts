import { describe, it, expect, vi } from "vitest";
import { buildGeminiPrompt, parseGeminiResponse, GeminiEngine } from "../src/translate/gemini";

const geminiOk = (text: string) => ({
  ok: true, status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});
const geminiErr = (status: number) => ({ ok: false, status, json: async () => ({}) });

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
  const fastEngine = (fetchFn: unknown, opts: { now?: () => number; onWait?: (ms: number) => void } = {}) =>
    new GeminiEngine("KEY", fetchFn as never, 0, async () => {}, [0], opts);

  it("toplu çevirir", async () => {
    const fetchFn = vi.fn(async () => geminiOk("⟦0⟧bir\n⟦1⟧iki"));
    const out = await fastEngine(fetchFn).translateBatch(["one", "two"], "en", "tr");
    expect(out).toEqual(["bir", "iki"]);
    const url = String((fetchFn.mock.calls[0] as unknown[])[0]);
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

  it("flash kotası dolunca (429) otomatik olarak flash-lite modeline geçer", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(geminiErr(429))
      .mockResolvedValueOnce(geminiOk("⟦0⟧selam"));
    const out = await fastEngine(fetchFn).translateBatch(["x"], "en", "tr");
    expect(out).toEqual(["selam"]);
    expect(String((fetchFn.mock.calls[0] as unknown[])[0])).toContain("gemini-flash-latest");
    expect(String((fetchFn.mock.calls[1] as unknown[])[0])).toContain("gemini-flash-lite-latest");
  });

  it("geçersiz model adında (404) sıradaki modele geçer", async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(geminiErr(404))
      .mockResolvedValueOnce(geminiOk("⟦0⟧selam"));
    const out = await fastEngine(fetchFn).translateBatch(["x"], "en", "tr");
    expect(out).toEqual(["selam"]);
  });

  it("TÜM modellerin kotası dolunca soğumaya girer ama KALICI kapanmaz", async () => {
    let t = 0;
    const onWait = vi.fn();
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(geminiErr(429)) // flash
      .mockResolvedValueOnce(geminiErr(429)) // flash-lite
      .mockResolvedValueOnce(geminiErr(429)) // gemma
      .mockResolvedValueOnce(geminiOk("⟦0⟧selam"));
    const engine = fastEngine(fetchFn, { now: () => t, onWait });

    const first = await engine.translateBatch(["x"], "en", "tr");
    expect(first).toEqual([null]);
    expect(onWait).toHaveBeenCalledWith(10_000);
    expect(fetchFn).toHaveBeenCalledTimes(3);

    fetchFn.mockClear();
    const stillBlocked = await engine.translateBatch(["x"], "en", "tr");
    expect(stillBlocked).toEqual([null]);
    expect(fetchFn).not.toHaveBeenCalled();

    t += 10_000;
    const after = await engine.translateBatch(["x"], "en", "tr");
    expect(after).toEqual(["selam"]);
  });
});
