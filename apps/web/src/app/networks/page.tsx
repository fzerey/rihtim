"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { NetworkSummary } from "@rihtim/shared";
import { QueryErrorBanner } from "@/components/QueryErrorBanner";
import { NetworkDetailDrawer } from "@/components/NetworkDetailDrawer";
import { Trash2, Plus, Search, Sparkles } from "lucide-react";
import { useT } from "@/i18n/provider";

const BUILTIN_NETWORKS = new Set(["bridge", "host", "none"]);

export default function NetworksPage() {
  const qc = useQueryClient();
  const { t } = useT();
  const { data, error, isFetching, refetch } = useQuery({
    queryKey: ["networks"],
    queryFn: () => api<NetworkSummary[]>("/networks"),
  });
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [onlyCustom, setOnlyCustom] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api("/networks", { method: "POST", json: { Name: name } }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["networks"] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/networks/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["networks"] }),
  });
  const prune = useMutation({
    mutationFn: () => api("/networks/prune", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["networks"] }),
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    const q = filter.trim().toLowerCase();
    return list.filter((n) => {
      if (onlyCustom && BUILTIN_NETWORKS.has(n.name)) return false;
      if (!q) return true;
      return (
        n.name.toLowerCase().includes(q) ||
        n.driver.toLowerCase().includes(q) ||
        n.scope.toLowerCase().includes(q)
      );
    });
  }, [data, filter, onlyCustom]);

  const onPrune = () => {
    if (window.confirm(t("networks.pruneConfirm"))) prune.mutate();
  };

  return (
    <div className="space-y-4">
      <QueryErrorBanner error={error} isFetching={isFetching} onRetry={() => refetch()} />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-semibold">{t("networks.title")}</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            className="bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm"
            placeholder={t("networks.newPlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            onClick={() => name && create.mutate()}
            className="px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-500 text-sm flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> {t("common.create")}
          </button>
          <button
            onClick={onPrune}
            disabled={prune.isPending}
            className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm flex items-center gap-1"
            title={t("networks.pruneHint")}
          >
            <Sparkles className="w-4 h-4" /> {t("networks.prune")}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/40">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("common.filter")}
              className="w-full bg-slate-950 border border-slate-800 rounded pl-7 pr-2 py-1 text-xs"
            />
          </div>
          <label className="flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyCustom}
              onChange={(e) => setOnlyCustom(e.target.checked)}
              className="accent-brand-500"
            />
            {t("networks.onlyCustom")}
          </label>
          {(filter || onlyCustom) && (
            <button
              onClick={() => {
                setFilter("");
                setOnlyCustom(false);
              }}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              {t("common.clear")}
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/70 text-slate-400">
            <tr className="text-left">
              <th className="px-4 py-2">{t("networks.columns.name")}</th>
              <th className="px-4 py-2">{t("networks.columns.driver")}</th>
              <th className="px-4 py-2">{t("networks.columns.scope")}</th>
              <th className="px-4 py-2">{t("networks.columns.subnet")}</th>
              <th className="px-4 py-2 text-right">{t("networks.columns.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/40">
            {rows.map((n) => {
              const builtin = BUILTIN_NETWORKS.has(n.name);
              return (
                <tr
                  key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  className="cursor-pointer hover:bg-slate-900/40"
                >
                  <td className="px-4 py-2 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{n.name}</span>
                      {builtin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          built-in
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2">{n.driver}</td>
                  <td className="px-4 py-2">{n.scope}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {n.ipam?.config?.map((c) => c.subnet).filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove.mutate(n.id);
                      }}
                      disabled={builtin}
                      title={builtin ? t("networks.builtinHint") : undefined}
                      className="p-1.5 rounded hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4 text-rose-400" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500 text-sm">
                  {t("networks.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <NetworkDetailDrawer networkId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
