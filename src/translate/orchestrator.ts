import { GeminiQuotaError, type EngineId, type TranslationEngine } from "../types";
import { isAbort } from "../util";

export class Orchestrator {
  constructor(private engines: TranslationEngine[]) {
    if (engines.length === 0) throw new Error("en az bir motor gerekli");
  }

  async translate(
    texts: string[],
    source: string,
    target: string,
    signal?: AbortSignal
  ): Promise<{ results: (string | null)[]; engineId: EngineId }> {
    for (const engine of this.engines) {
      try {
        const results = await engine.translateBatch(texts, source, target, signal);
        const okCount = results.filter((r) => r !== null).length;
        if (okCount > 0 || texts.length === 0) return { results, engineId: engine.id };
      } catch (e) {
        if (isAbort(e) || e instanceof GeminiQuotaError) throw e;
        // motor düzeyinde hata: sıradaki motora geç
      }
    }
    return {
      results: texts.map(() => null),
      engineId: this.engines[this.engines.length - 1].id,
    };
  }
}
