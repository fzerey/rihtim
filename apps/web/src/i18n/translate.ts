import { messages, type Locale } from "./messages";

type Dict = typeof messages.en;

function get(obj: any, path: string): string | undefined {
  return path.split(".").reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const dict = (messages[locale] ?? messages.en) as unknown as Record<string, unknown>;
  let value = get(dict, key);
  if (value === undefined) value = get(messages.en, key);
  if (value === undefined) return key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      value = value.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
    }
  }
  return value;
}

export function translateOrFallback(
  locale: Locale,
  key: string,
  fallback: string,
  vars?: Record<string, string | number>,
): string {
  const result = translate(locale, key, vars);
  return result === key ? fallback : result;
}

export type { Locale };
