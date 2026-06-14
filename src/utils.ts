/**
 * Count words in a piece of text.
 * Chinese characters (CJK range) count as 1 word each;
 * English/other words are split by whitespace.
 */
export function wordCount(text: string): number {
  const cjkRe =
    /[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef\ufe30-\ufe4f\u{20000}-\u{2a6df}\u{2a700}-\u{2b73f}\u{2b740}-\u{2b81f}\u{2b820}-\u{2ceaf}\u{2ceb0}-\u{2ebef}\u{30000}-\u{3134f}\u{f900}-\u{faff}]/gu;
  const cjkCount = (text.match(cjkRe) || []).length;
  const nonCjk = text.replace(cjkRe, " ").trim();
  const wordCount = nonCjk ? nonCjk.split(/\s+/).filter((w) => w.length > 0).length : 0;
  return cjkCount + wordCount;
}

/**
 * Extract a date string from a filename.
 * Supports both "2024-01-15.md" and "20240115.md" formats.
 */
export function dateFromFilename(name: string): string | null {
  const m1 = name.match(/^(\d{4})-(\d{2})-(\d{2})\.md$/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  const m2 = name.match(/^(\d{4})(\d{2})(\d{2})\.md$/);
  return m2 ? `${m2[1]}-${m2[2]}-${m2[3]}` : null;
}

/** Strip YAML front matter from text. */
export function stripFrontMatter(text: string): string {
  if (text.startsWith("---")) {
    const end = text.indexOf("---", 3);
    if (end !== -1) return text.slice(end + 3).trimStart();
  }
  return text;
}

export interface LeafItem {
  filePath: string;
  lineNumber: number;
  text: string;
  cleanText: string;
  wordCount: number;
}

const LEAF_RE = /^(\s*)([-*+])\s+(.*)/;

/**
 * Extract list items (leaf nodes) from markdown content.
 * Only top-level list items and items whose parent is not also a list item are returned.
 */
export function extractLeafItems(text: string, filePath: string): LeafItem[] {
  const lines = text.split("\n");
  const items: { index: number; indent: number; marker: string; text: string; fullLine: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(LEAF_RE);
    if (m) {
      items.push({
        index: i,
        indent: m[1].length,
        marker: m[2],
        text: m[3],
        fullLine: lines[i],
      });
    }
  }

  const result: LeafItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const cur = items[i];
    const next = items[i + 1];
    // Skip if the next item is a child (greater indent)
    if (next !== undefined && next.indent > cur.indent) continue;

    const clean = cur.text.trim();
    result.push({
      filePath,
      lineNumber: cur.index,
      text: cur.fullLine.trim(),
      cleanText: clean,
      wordCount: wordCount(clean),
    });
  }
  return result;
}

/** Sleep for `ms` milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fisher-Yates shuffle (returns a new array). */
export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Compare two string arrays for set-equality (order-independent). */
export function arrayEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

/** Format a date as YYYY-MM-DD. */
export function dateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Shorten a file path for display — show last two segments. */
export function shortPath(filePath: string): string {
  const parts = filePath.split("/");
  if (parts.length <= 2) return filePath;
  return `…/${parts.slice(-2).join("/")}`;
}
