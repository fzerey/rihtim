"use client";
import { useEffect, useRef } from "react";
import type { ContainerSummary } from "@rihtim/shared";
import { useLogStream } from "@/lib/useLogStream";
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
  const { text } = useLogStream(container.id, 2000);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [text]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const name = container.names.map((n) => n.replace(/^\//, "")).join(", ");

  return (
    <div className="fixed inset-0 z-30 flex justify-end">
      <div aria-hidden className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${t("containers.actions.logs")}: ${name}`}
        className="relative w-full max-w-3xl h-full bg-slate-950 border-l border-slate-800 flex flex-col"
      >
        <div className="h-12 border-b border-slate-800 flex items-center justify-between px-4">
          <div>
            <div className="text-sm font-medium">{name}</div>
            <div className="text-xs text-slate-500 font-mono">{container.id.slice(0, 12)}</div>
          </div>
          <button
            aria-label={t("common.close")}
            className="p-1.5 hover:bg-slate-800 rounded"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div
          ref={boxRef}
          className="flex-1 overflow-auto p-3 font-mono text-xs whitespace-pre-wrap bg-black/40"
        >
          {text}
        </div>
      </div>
    </div>
  );
}
