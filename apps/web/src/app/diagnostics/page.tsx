"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, ClipboardCopy, RefreshCw, Wrench, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { QueryErrorBanner } from "@/components/QueryErrorBanner";
import { useT } from "@/i18n/provider";

type DiagnosticFix = {
  id: string;
  kind: "auto" | "command";
  label: string;
  description: string;
  command?: string;
};

type DiagnosticCheck = {
  id: string;
  label: string;
  ok: boolean;
  message: string;
  fixes?: DiagnosticFix[];
};

type DiagnosticPayload = {
  ok: boolean;
  generatedAt: string;
  checks: DiagnosticCheck[];
};

export default function DiagnosticsPage() {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const [lastFixMessage, setLastFixMessage] = useState<string | null>(null);
  const [isRunningChecks, setIsRunningChecks] = useState(false);

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ["diagnostics"],
    queryFn: () => api<DiagnosticPayload>("/system/diagnostics", { cache: "no-store" }),
  });

  const runChecks = async () => {
    setIsRunningChecks(true);
    try {
      await refetch();
    } finally {
      setIsRunningChecks(false);
    }
  };

  const fix = useMutation({
    mutationFn: (fixId: string) =>
      api<{ ok: boolean; fixId: string; message?: string }>("/system/diagnostics/fix", {
        method: "POST",
        json: { fixId },
      }),
    onSuccess: async (res) => {
      setLastFixMessage(res.message ?? null);
      await refetch();
    },
  });

  const copyDiagnostics = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const copyCommand = async (cmd?: string) => {
    if (!cmd) return;
    await navigator.clipboard.writeText(cmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      <QueryErrorBanner error={error} isFetching={isFetching} onRetry={() => refetch()} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("diagnostics.title")}</h1>
          <p className="text-sm text-slate-400">{t("diagnostics.subtitle")}</p>
        </div>
        <button
          onClick={() => void runChecks()}
          disabled={isRunningChecks || isFetching}
          className="px-3 py-1.5 rounded-md text-sm bg-slate-800 hover:bg-slate-700 inline-flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={(isRunningChecks || isFetching) ? "w-4 h-4 animate-spin" : "w-4 h-4"} />
          {t("diagnostics.run")}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => void copyDiagnostics()}
          disabled={!data}
          className="px-3 py-1.5 rounded-md text-sm bg-slate-800 hover:bg-slate-700 inline-flex items-center gap-2 disabled:opacity-50"
        >
          <ClipboardCopy className="w-4 h-4" />
          {copied ? t("diagnostics.copy.copied") : t("diagnostics.copy.button")}
        </button>
        {lastFixMessage && <span className="text-xs text-slate-400">{lastFixMessage}</span>}
      </div>

      {isLoading && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-slate-500 text-sm">
          {t("common.loading")}
        </div>
      )}

      {data && (
        <>
          <div
            className={
              "rounded-xl border p-4 text-sm flex items-center gap-2 " +
              (data.ok
                ? "border-emerald-700/60 bg-emerald-900/10 text-emerald-300"
                : "border-amber-700/60 bg-amber-900/10 text-amber-200")
            }
          >
            {data.ok ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            <span>{data.ok ? t("diagnostics.status.ok") : t("diagnostics.status.warn")}</span>
            <span className="text-xs opacity-80">• {new Date(data.generatedAt).toLocaleString()}</span>
          </div>

          <div className="grid gap-3">
            {data.checks.map((c) => (
              <div
                key={c.id}
                className={
                  "rounded-xl border p-4 " +
                  (c.ok ? "border-emerald-800/40 bg-emerald-900/5" : "border-rose-800/40 bg-rose-900/5")
                }
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  {c.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                  {c.label}
                </div>
                <p className="text-sm text-slate-300 mt-1 break-words">{c.message}</p>

                {!c.ok && c.fixes && c.fixes.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {c.fixes.map((f) => (
                      <div key={f.id} className="rounded-lg border border-slate-800 bg-slate-950/60 p-3">
                        <p className="text-xs text-slate-300">{f.description}</p>
                        <div className="mt-2 flex items-center gap-2">
                          {f.kind === "auto" ? (
                            <button
                              onClick={() => fix.mutate(f.id)}
                              disabled={fix.isPending}
                              className="px-2.5 py-1.5 rounded text-xs bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 inline-flex items-center gap-1"
                            >
                              <Wrench className="w-3.5 h-3.5" />
                              {fix.isPending ? t("diagnostics.quickFix.running") : f.label}
                            </button>
                          ) : (
                            <button
                              onClick={() => void copyCommand(f.command)}
                              className="px-2.5 py-1.5 rounded text-xs bg-slate-800 hover:bg-slate-700 inline-flex items-center gap-1"
                            >
                              <ClipboardCopy className="w-3.5 h-3.5" />
                              {f.label}
                            </button>
                          )}
                          {f.command && (
                            <code className="text-xs text-slate-400 break-all">{f.command}</code>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
