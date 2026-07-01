export async function api<T>(
  path: string,
  init?: RequestInit & { json?: unknown },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.json !== undefined) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/api${path}`, {
    ...init,
    headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    throw new Error(data?.error || data?.message || res.statusText);
  }
  return data as T;
}

export function wsUrl(path: string): string {
  if (typeof window === "undefined") return "";
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}

export function humanBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

export function timeAgo(unixSec: number, locale: string = "en"): string {
  const diff = Math.max(0, Date.now() / 1000 - unixSec);
  const units =
    locale === "tr"
      ? { s: "sn", m: "dk", h: "sa", d: "g", mo: "ay", y: "y" }
      : { s: "s", m: "m", h: "h", d: "d", mo: "mo", y: "y" };
  const table: Array<[number, string, number]> = [
    [60, units.s, 1],
    [60 * 60, units.m, 60],
    [60 * 60 * 24, units.h, 60 * 60],
    [60 * 60 * 24 * 30, units.d, 60 * 60 * 24],
    [60 * 60 * 24 * 365, units.mo, 60 * 60 * 24 * 30],
    [Number.POSITIVE_INFINITY, units.y, 60 * 60 * 24 * 365],
  ];
  for (const [threshold, unit, divisor] of table) {
    if (diff < threshold) return `${Math.floor(diff / divisor)}${unit}`;
  }
  return "";
}
