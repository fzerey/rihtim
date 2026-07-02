"use client";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useT } from "@/i18n/provider";

export function QueryErrorBanner({
  error,
  isFetching,
  onRetry,
}: {
  error: unknown;
  isFetching?: boolean;
  onRetry: () => void;
}) {
  const { t } = useT();
  if (!error) return null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="flex items-center gap-3 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="font-medium">{t("common.loadError")}</div>
        <div className="text-xs text-rose-300/80 truncate">{message}</div>
      </div>
      <button
        onClick={onRetry}
        disabled={isFetching}
        className="inline-flex items-center gap-1 rounded-md border border-rose-500/40 bg-rose-500/20 px-2 py-1 text-xs text-rose-100 hover:bg-rose-500/30 disabled:opacity-50"
      >
        <RefreshCw className={`w-3 h-3 ${isFetching ? "animate-spin" : ""}`} />
        {t("common.retry")}
      </button>
    </div>
  );
}
