"use client";
import { useEffect, useRef, useState } from "react";
import { wsUrl } from "@/lib/api";
import { useT } from "@/i18n/provider";

export function LogsPanel({ containerId }: { containerId: string }) {
  const { t } = useT();
  const [lines, setLines] = useState<string[]>([]);
  const [autoscroll, setAutoscroll] = useState(true);
  const [filter, setFilter] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl(`/ws/containers/${containerId}/logs`));
    ws.onmessage = (ev) => {
      setLines((prev) => {
        const next = [...prev, String(ev.data)];
        return next.length > 5000 ? next.slice(next.length - 5000) : next;
      });
    };
    return () => ws.close();
  }, [containerId]);

  useEffect(() => {
    if (autoscroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [lines, autoscroll]);

  const filtered = filter
    ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 pb-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("common.filter")}
          className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm"
        />
        <label className="text-xs text-slate-400 flex items-center gap-1">
          <input
            type="checkbox"
            checked={autoscroll}
            onChange={(e) => setAutoscroll(e.target.checked)}
          />
          {t("common.autoscroll")}
        </label>
        <button
          onClick={() => setLines([])}
          className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
        >
          {t("common.clear")}
        </button>
      </div>
      <div
        ref={boxRef}
        className="flex-1 min-h-[400px] overflow-auto font-mono text-xs whitespace-pre-wrap bg-black/50 border border-slate-800 rounded-md p-3"
      >
        {filtered.join("")}
      </div>
    </div>
  );
}
