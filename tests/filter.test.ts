import { describe, it, expect } from "vitest";
import { isTranslatable } from "../src/translate/filter";

describe("isTranslatable", () => {
  it("normal cümle çevrilir", () => {
    expect(isTranslatable("The quick brown fox jumps.")).toBe(true);
  });
  it("tek harf/boş çevrilmez", () => {
    expect(isTranslatable("a")).toBe(false);
    expect(isTranslatable("   ")).toBe(false);
  });
  it("yalnızca sayı/noktalama çevrilmez", () => {
    expect(isTranslatable("42")).toBe(false);
    expect(isTranslatable("3.14 - 2,718")).toBe(false);
    expect(isTranslatable("• § 12.3 (a)")).toBe(false);
  });
  it("URL ve e-posta çevrilmez", () => {
    expect(isTranslatable("https://example.com/page?x=1")).toBe(false);
    expect(isTranslatable("www.example.com")).toBe(false);
    expect(isTranslatable("kisi@example.com")).toBe(false);
  });
  it("sayı içeren gerçek cümle çevrilir", () => {
    expect(isTranslatable("Chapter 3 covers 42 topics.")).toBe(true);
  });
});
