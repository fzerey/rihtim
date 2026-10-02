export type DurationUnit = "second" | "minute" | "hour" | "day" | "week" | "month" | "year";

export type Duration = { value: number; unit: DurationUnit };

export type ParsedStatus = {
  kind: "up" | "exited" | "restarting" | "created" | "dead" | "removing" | "unknown";
  exitCode?: number;
  duration?: Duration;
  health?: "healthy" | "unhealthy" | "starting";
  paused?: boolean;
};

// Mirrors Docker's units.HumanDuration output ("About an hour", "3 weeks", ...).
export function parseDuration(text: string): Duration | undefined {
  const s = text.trim();
  if (/^less than a second$/i.test(s)) return { value: 1, unit: "second" };
  if (/^about a minute$/i.test(s)) return { value: 1, unit: "minute" };
  if (/^about an hour$/i.test(s)) return { value: 1, unit: "hour" };
  const m = s.match(/^(\d+) (second|minute|hour|day|week|month|year)s?$/i);
  if (!m) return undefined;
  return { value: Number(m[1]), unit: m[2].toLowerCase() as DurationUnit };
}

export function parseDockerStatus(status: string): ParsedStatus {
  let s = status.trim();
  const result: ParsedStatus = { kind: "unknown" };

  const health = s.match(/\s*\((healthy|unhealthy|health: starting)\)\s*$/i);
  if (health) {
    const h = health[1].toLowerCase();
    result.health = h === "health: starting" ? "starting" : (h as "healthy" | "unhealthy");
    s = s.slice(0, health.index).trim();
  }
  if (/\s*\(paused\)\s*$/i.test(s)) {
    result.paused = true;
    s = s.replace(/\s*\(paused\)\s*$/i, "").trim();
  }

  let m: RegExpMatchArray | null;
  if ((m = s.match(/^Up (.+)$/i))) {
    result.kind = "up";
    result.duration = parseDuration(m[1]);
  } else if ((m = s.match(/^(Exited|Restarting) \((-?\d+)\) (.+) ago$/i))) {
    result.kind = m[1].toLowerCase() === "exited" ? "exited" : "restarting";
    result.exitCode = Number(m[2]);
    result.duration = parseDuration(m[3]);
  } else if (/^Created$/i.test(s)) {
    result.kind = "created";
  } else if (/^Dead$/i.test(s)) {
    result.kind = "dead";
  } else if (/^Removal In Progress$/i.test(s)) {
    result.kind = "removing";
  }
  return result;
}

export function formatDuration(d: Duration, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "unit", unit: d.unit, unitDisplay: "long" }).format(d.value);
}

export function formatAgo(d: Duration, locale: string): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-d.value, d.unit);
}
