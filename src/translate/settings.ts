const KEY = "pdf-cevirmen.gemini-key";

export function getGeminiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function setGeminiKey(v: string): void {
  try {
    const t = v.trim();
    if (t) localStorage.setItem(KEY, t);
    else localStorage.removeItem(KEY);
  } catch {
    // localStorage kapalıysa anahtar bu oturumla sınırlı kalır
  }
}
