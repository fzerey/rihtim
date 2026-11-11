/**
 * Keeps only the last `maxLines` lines of `text`. A trailing partial line counts as a line.
 * Walks backwards so the cost is proportional to what is kept, not to the whole text.
 */
export function keepLastLines(text: string, maxLines: number): string {
  if (maxLines <= 0) return "";
  // A trailing newline ends the last line; it does not start a new one.
  const end = text.endsWith("\n") ? text.length - 1 : text.length;
  let lines = 1;
  for (let i = end - 1; i >= 0; i--) {
    if (text.charCodeAt(i) === 10 && ++lines > maxLines) return text.slice(i + 1);
  }
  return text;
}

/** Lines of `text` that contain `query`, case-insensitively, keeping their line breaks. */
export function filterLines(text: string, query: string): string {
  const q = query.toLowerCase();
  return text
    .split(/(?<=\n)/)
    .filter((line) => line.toLowerCase().includes(q))
    .join("");
}
