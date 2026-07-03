import { describe, it, expect } from "vitest";
import { STR, SOURCE_LANGS, TARGET_LANGS } from "../src/strings";

describe("iskelet", () => {
  it("stringler yüklü", () => {
    expect(STR.appName).toBe("PDF Çevirmen");
    expect(SOURCE_LANGS[0][0]).toBe("auto");
    expect(TARGET_LANGS[0][0]).toBe("tr");
  });
});
