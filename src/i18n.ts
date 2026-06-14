/** Minimal interface for moment.js locale API. */
interface MomentShim {
  locale(): string;
}

/** Detect Obsidian UI language and return a translator function. */
const lang = (() => {
  let l = "";
  try {
    l = (typeof moment !== "undefined" ? (moment as MomentShim).locale() : "").toLowerCase();
  } catch {
    // moment may not be available in all environments
  }
  l = l || (typeof navigator !== "undefined" ? navigator.language : "").toLowerCase();
  return l.startsWith("zh");
})();

/** Translate: returns `zh` if Obsidian is in Chinese, else `en`. */
export function t(zh: string, en: string): string {
  return lang ? zh : en;
}
