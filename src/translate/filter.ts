export function isTranslatable(text: string): boolean {
  const t = text.trim();
  // en az iki harf yoksa (yalnızca sayı/noktalama/madde imi) çevirme
  const letters = t.match(/\p{L}/gu)?.length ?? 0;
  if (letters < 2) return false;
  if (/^(https?:\/\/|www\.)\S+$/i.test(t)) return false;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return false;
  return true;
}
