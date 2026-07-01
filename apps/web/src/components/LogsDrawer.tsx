"use client";
import { useEffect, useRef, useState } from "react";
import type { ContainerSummary } from "@rihtim/shared";
import { wsUrl } from "@/lib/api";
import { useT } from "@/i18n/provider";
import { X } from "lucide-react";

export function LogsDrawer({
  container,
  onClose,
}: {
  container: ContainerSummary;
  onClose: () => void;
}) {
  const { t } = useT();
  const [lines, setLines] = useState<string[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl(`/ws/containers/${container.id}/logs`));
    ws.onmessage = (ev) => {
      setLines((prev) => {
        const next = [...prev, String(ev.data)];
        return next.length > 2000 ? next.slice(next.length - 2000) : next;
      });
    };
    return () => ws.close();
  }, [container.id]);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <button
        aria-label={t("common.close")}
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative w-full max-w-3xl h-full bg-slate-950 border-l border-slate-800 flex flex-col">
        <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4">
          <div>
            <div className="text-sm font-medium">
              {container.names.map((n) => n.replace(/^\//, "")).join(", ")}
            </div>
            <div className="text-xs text-slate-500 font-mono">{container.id.slice(0, 12)}</div>
          </div>
          <button className="p-1.5 hover:bg-slate-800 rounded" onClick={onClose}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div
          ref={boxRef}
          className="flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap bg-black/40"
        >
          {lines.join("")}
        </div>
      </div>
    </div>
  );
}
