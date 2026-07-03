export interface Chunk {
  indices: number[];
  text: string;
}

export function makeChunks(texts: string[], maxChars = 4500): Chunk[] {
  const chunks: Chunk[] = [];
  let cur: Chunk | null = null;
  texts.forEach((t, i) => {
    const clean = t.replace(/\s*\n\s*/g, " ").trim();
    if (cur && cur.text.length + 1 + clean.length <= maxChars) {
      cur.indices.push(i);
      cur.text += "\n" + clean;
    } else {
      cur = { indices: [i], text: clean };
      chunks.push(cur);
    }
  });
  return chunks;
}

export function splitTranslated(chunk: Chunk, translated: string): string[] | null {
  const n = chunk.indices.length;
  let parts = translated.split("\n").map((p) => p.trim());
  if (parts.length !== n) parts = parts.filter((p) => p.length > 0);
  return parts.length === n ? parts : null;
}
