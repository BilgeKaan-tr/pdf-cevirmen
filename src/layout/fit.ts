export interface Measurer {
  width(text: string, size: number): number;
}

export interface FitResult {
  size: number;
  lines: string[];
  lineHeight: number;
}

const LINE_SPACING = 1.25;
const MIN_SIZE = 6;

export function wrapText(text: string, size: number, maxWidth: number, m: Measurer): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let cur = "";
  for (let word of words) {
    while (m.width(word, size) > maxWidth && word.length > 1) {
      let cut = word.length - 1;
      while (cut > 1 && m.width(word.slice(0, cut), size) > maxWidth) cut--;
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const candidate = cur ? cur + " " + word : word;
    if (!cur || m.width(candidate, size) <= maxWidth) cur = candidate;
    else { lines.push(cur); cur = word; }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function fitText(
  text: string,
  boxWidth: number,
  boxHeight: number,
  startSize: number,
  m: Measurer,
  minSize = MIN_SIZE
): FitResult {
  for (let size = Math.max(startSize, minSize); size >= minSize; size -= 0.5) {
    const lines = wrapText(text, size, boxWidth, m);
    const lineHeight = size * LINE_SPACING;
    if (lines.length * lineHeight <= boxHeight * 1.02) return { size, lines, lineHeight };
  }
  return {
    size: minSize,
    lines: wrapText(text, minSize, boxWidth, m),
    lineHeight: minSize * LINE_SPACING,
  };
}
