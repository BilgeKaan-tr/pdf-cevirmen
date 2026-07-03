import { describe, it, expect } from "vitest";
import { wrapText, fitText, type Measurer } from "../src/layout/fit";

// deterministik ölçer: genişlik = karakter sayısı * boyut * 0.5
const m: Measurer = { width: (t, s) => t.length * s * 0.5 };

describe("wrapText", () => {
  it("kelimeleri satıra sarar", () => {
    // boyut 10 → karakter genişliği 5; maxWidth 50 → satır başına 10 karakter
    expect(wrapText("aaa bbb ccc ddd", 10, 50, m)).toEqual(["aaa bbb", "ccc ddd"]);
  });
  it("kutudan geniş tek kelimeyi karakterden böler", () => {
    const lines = wrapText("abcdefghijklmnop", 10, 25, m); // satır başına 5 karakter
    expect(lines.every((l) => m.width(l, 10) <= 25)).toBe(true);
    expect(lines.join("")).toBe("abcdefghijklmnop");
  });
});

describe("fitText", () => {
  it("sığıyorsa başlangıç boyutunu korur", () => {
    const fit = fitText("kısa", 100, 20, 10, m);
    expect(fit.size).toBe(10);
    expect(fit.lines).toEqual(["kısa"]);
  });
  it("sığmayınca boyutu küçültür ve kutuya sığdırır", () => {
    // 40 karakter, boyut 10'da tek satır genişliği 200 > kutu 100
    const fit = fitText("a".repeat(40), 100, 20, 10, m);
    expect(fit.size).toBeLessThan(10);
    expect(fit.lines.length * fit.lineHeight).toBeLessThanOrEqual(20 * 1.02);
  });
  it("taban boyutta bile sığmazsa %10 taşma bütçesi içinde kalır", () => {
    const fit = fitText("a".repeat(40), 100, 14, 10, m);
    expect(fit.size).toBe(6);
    expect(fit.lines.length * fit.lineHeight).toBeLessThanOrEqual(14 * 1.1);
  });
  it("taban 6pt'nin altına inmez", () => {
    const fit = fitText("çok ".repeat(200), 50, 10, 12, m);
    expect(fit.size).toBe(6);
    expect(fit.lines.length).toBeGreaterThan(0);
  });
});
