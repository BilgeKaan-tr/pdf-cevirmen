import { describe, it, expect } from "vitest";
import { makeChunks, splitTranslated } from "../src/translate/chunking";

describe("makeChunks", () => {
  it("sınıra kadar paketler", () => {
    const chunks = makeChunks(["aaaa", "bbbb", "cccc"], 9);
    // "aaaa\nbbbb" = 9 karakter sığar; "cccc" yeni parça
    expect(chunks.length).toBe(2);
    expect(chunks[0]).toEqual({ indices: [0, 1], text: "aaaa\nbbbb" });
    expect(chunks[1]).toEqual({ indices: [2], text: "cccc" });
  });
  it("tek büyük blok kendi parçasını alır", () => {
    const chunks = makeChunks(["x".repeat(50), "kısa"], 10);
    expect(chunks.length).toBe(2);
    expect(chunks[0].indices).toEqual([0]);
  });
  it("blok içi satır sonlarını boşluğa çevirir", () => {
    const chunks = makeChunks(["ab\ncd"], 100);
    expect(chunks[0].text).toBe("ab cd");
  });
});

describe("splitTranslated", () => {
  const chunk = { indices: [3, 7, 9], text: "a\nb\nc" };
  it("tam eşleşme", () => {
    expect(splitTranslated(chunk, "çeviri1\nçeviri2\nçeviri3"))
      .toEqual(["çeviri1", "çeviri2", "çeviri3"]);
  });
  it("fazladan boş satırları temizleyip eşleştirir", () => {
    expect(splitTranslated(chunk, "ç1\n\nç2\n\nç3\n"))
      .toEqual(["ç1", "ç2", "ç3"]);
  });
  it("uyuşmazlıkta null döner", () => {
    expect(splitTranslated(chunk, "hepsi tek satırda birleşti")).toBeNull();
  });
});
