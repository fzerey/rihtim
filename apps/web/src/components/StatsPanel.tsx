"use client";
import { useEffect, useMemo, useState, useId } from "react";
import type { ContainerStatsSample } from "@rihtim/shared";
import { wsUrl, humanBytes } from "@/lib/api";
import { useT } from "@/i18n/provider";

const HISTORY = 60;

export function StatsPanel({ containerId }: { containerId: string }) {
  const { t } = useT();
  const [samples, setSamples] = useState<ContainerStatsSample[]>([]);
  const [latest, setLatest] = useState<ContainerStatsSample | null>(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl(`/ws/containers/${containerId}/stats`));
    ws.onmessage = (ev) => {
      try {
        const s = JSON.parse(String(ev.data)) as ContainerStatsSample;
        if (!s || (s as any).error) return;
        setLatest(s);
        setSamples((prev) => {
          const next = [...prev, s];
          return next.length > HISTORY ? next.slice(next.length - HISTORY) : next;
        });
      } catch {
        /* ignore */
      }
    };
    return () => ws.close();
  }, [containerId]);

  const rxSeries = useMemo(() => deltaSeries(samples.map((s) => s.networkRx)), [samples]);
  const txSeries = useMemo(() => deltaSeries(samples.map((s) => s.networkTx)), [samples]);
  const rxRate = rxSeries.at(-1) ?? 0;
  const txRate = txSeries.at(-1) ?? 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Metric
        title={t("containers.stats.cpu")}
        value={latest ? `${latest.cpuPercent.toFixed(1)}%` : "—"}
        series={samples.map((s) => s.cpuPercent)}
        max={100}
        unit="%"
        color="#38bdf8"
      />
      <Metric
        title={t("containers.stats.memory")}
        value={
          latest
            ? `${humanBytes(latest.memoryUsage)} / ${humanBytes(latest.memoryLimit)} (${latest.memoryPercent.toFixed(1)}%)`
            : "—"
        }
        series={samples.map((s) => s.memoryPercent)}
        max={100}
        unit="%"
        color="#a78bfa"
      />
      <Metric
        title={t("containers.stats.netRx")}
        value={latest ? `${humanBytes(rxRate)}/s · ${humanBytes(latest.networkRx)}` : "—"}
        series={rxSeries}
        format={(v) => `${humanBytes(v)}/s`}
        color="#34d399"
      />
      <Metric
        title={t("containers.stats.netTx")}
        value={latest ? `${humanBytes(txRate)}/s · ${humanBytes(latest.networkTx)}` : "—"}
        series={txSeries}
        format={(v) => `${humanBytes(v)}/s`}
        color="#fbbf24"
      />
    </div>
  );
}

function deltaSeries(values: number[]): number[] {
  if (values.length < 2) return values.length === 1 ? [0] : [];
  const out: number[] = [0];
  for (let i = 1; i < values.length; i++) {
    out.push(Math.max(0, values[i] - values[i - 1]));
  }
  return out;
}

function Metric({
  title,
  value,
  series,
  max,
  unit,
  format,
  color,
}: {
  title: string;
  value: string;
  series: number[];
  max?: number;
  unit?: string;
  format?: (v: number) => string;
  color: string;
}) {
  const gradId = useId();
  const w = 320;
  const h = 80;
  const padY = 6;
  const localMax = Math.max(max ?? 0, ...series, 1);
  const denom = localMax === 0 ? 1 : localMax;
  const drawH = h - padY * 2;

  const coords = series.map((v, i) => {
    const x = series.length <= 1 ? w : (i / (series.length - 1)) * w;
    const y = padY + drawH - (v / denom) * drawH;
    return [x, y] as const;
  });

  const linePath = coords
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const areaPath = coords.length
    ? `${linePath} L${coords[coords.length - 1][0].toFixed(1)} ${h} L${coords[0][0].toFixed(1)} ${h} Z`
    : "";

  const topLabel = format
    ? format(localMax)
    : `${localMax.toFixed(unit === "%" ? 0 : 1)}${unit ?? ""}`;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">{title}</div>
        <div className="text-sm font-medium">{value}</div>
      </div>
      <div className="relative mt-3">
        <div className="absolute inset-y-0 left-0 flex flex-col justify-between text-[10px] text-slate-600 font-mono pr-2 pointer-events-none">
          <span>{topLabel}</span>
          <span>0</span>
        </div>
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="w-full h-24 pl-10"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((r) => (
            <line
              key={r}
              x1="0"
              x2={w}
              y1={padY + drawH * r}
              y2={padY + drawH * r}
              stroke="#334155"
              strokeWidth="0.5"
              strokeDasharray="2 3"
              opacity="0.5"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {areaPath && <path d={areaPath} fill={`url(#${gradId})`} />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {coords.length > 0 && (
            <circle
              cx={coords[coords.length - 1][0]}
              cy={coords[coords.length - 1][1]}
              r="2.5"
              fill={color}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      </div>
    </div>
  );
}

