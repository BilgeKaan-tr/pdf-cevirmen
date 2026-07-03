export interface RawItem {
  text: string;
  x: number;       // PDF punto, sol kenardan
  y: number;       // PDF punto, sayfanın ÜSTÜNDEN ölçülen üst kenar
  width: number;
  height: number;
  fontSize: number;
  fontName: string;
}

export interface Line {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
}

export interface Block {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  bold: boolean;
  translatable: boolean;
  translated: string | null;
  failed: boolean;
}

export type EngineId = "google" | "lingva" | "gemini";

export interface TranslationEngine {
  readonly id: EngineId;
  translateBatch(
    texts: string[],
    source: string,
    target: string,
    signal?: AbortSignal
  ): Promise<(string | null)[]>;
}

export class PdfPasswordError extends Error {
  constructor() { super("password"); this.name = "PdfPasswordError"; }
}

export class GeminiQuotaError extends Error {
  constructor() { super("gemini quota"); this.name = "GeminiQuotaError"; }
}

export class RateLimitError extends Error {
  constructor() { super("rate limited"); this.name = "RateLimitError"; }
}
