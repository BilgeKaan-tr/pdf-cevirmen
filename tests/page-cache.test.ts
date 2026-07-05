import { describe, it, expect, vi } from "vitest";
import { PageCache } from "../src/pdf/page-cache";

function fakePage() {
  return { cleanup: vi.fn() };
}

describe("PageCache", () => {
  it("aynı sayfa için tek kez getirir (extract+render aynı sayfayı paylaşır)", async () => {
    const fetchFn = vi.fn(async (_n: number) => fakePage());
    const cache = new PageCache(fetchFn);
    const a = await cache.get(1);
    const b = await cache.get(1);
    expect(a).toBe(b);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("yeni sayfaya geçince önceki sayfanın belleğini cleanup() ile serbest bırakır", async () => {
    const pages = [fakePage(), fakePage()];
    let i = 0;
    const cache = new PageCache(async () => pages[i++]);
    await cache.get(1);
    expect(pages[0].cleanup).not.toHaveBeenCalled();
    await cache.get(2);
    expect(pages[0].cleanup).toHaveBeenCalledTimes(1); // önceki sayfa temizlendi
    expect(pages[1].cleanup).not.toHaveBeenCalled();   // yeni sayfa henüz değil
  });

  it("dispose() son sayfayı da temizler", async () => {
    const p = fakePage();
    const cache = new PageCache(async () => p);
    await cache.get(5);
    cache.dispose();
    expect(p.cleanup).toHaveBeenCalledTimes(1);
  });
});
