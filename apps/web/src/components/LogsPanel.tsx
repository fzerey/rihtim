"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { filterLines } from "@/lib/logBuffer";
import { useLogStream } from "@/lib/useLogStream";
import { useT } from "@/i18n/provider";

export function LogsPanel({ containerId }: { containerId: string }) {
  const { t } = useT();
  const { text, clear } = useLogStream(containerId, 5000);
  const [autoscroll, setAutoscroll] = useState(true);
  const [filter, setFilter] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoscroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [text, autoscroll]);

  const shown = useMemo(() => (filter ? filterLines(text, filter) : text), [text, filter]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 pb-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("common.filter")}
          className="input flex-1"
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
          onClick={clear}
          className="btn btn-secondary btn-sm"
        >
          {t("common.clear")}
        </button>
      </div>
      <div
        ref={boxRef}
        className="flex-1 min-h-[400px] overflow-auto font-mono text-xs whitespace-pre-wrap bg-black/50 border border-slate-800 rounded-md p-3"
      >
        {shown}
      </div>
    </div>
  );
}
