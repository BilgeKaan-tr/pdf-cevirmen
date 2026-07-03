import { describe, it, expect } from "vitest";
import { mapPool, withRetry } from "../src/util";

describe("mapPool", () => {
  it("sırayı korur ve limiti aşmaz", async () => {
    let active = 0, maxActive = 0;
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = await mapPool(items, 3, async (n) => {
      active++; maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return n * 2;
    });
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14, 16]);
    expect(maxActive).toBeLessThanOrEqual(3);
  });
});

describe("withRetry", () => {
  it("iki hatadan sonra başarır", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => { if (++calls < 3) throw new Error("geçici"); return "tamam"; },
      { delays: [1, 1, 1], sleep: async () => {} }
    );
    expect(result).toBe("tamam");
    expect(calls).toBe(3);
  });
  it("denemeler bitince son hatayı fırlatır", async () => {
    await expect(
      withRetry(async () => { throw new Error("kalıcı"); }, { delays: [1], sleep: async () => {} })
    ).rejects.toThrow("kalıcı");
  });
  it("retryIf=false hatayı hemen fırlatır", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new Error("özel"); },
        { delays: [1, 1], sleep: async () => {}, retryIf: () => false })
    ).rejects.toThrow("özel");
    expect(calls).toBe(1);
  });
  it("abort hatası yeniden denenmez", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => { calls++; throw new DOMException("x", "AbortError"); },
        { delays: [1, 1], sleep: async () => {} })
    ).rejects.toThrow();
    expect(calls).toBe(1);
  });
});
