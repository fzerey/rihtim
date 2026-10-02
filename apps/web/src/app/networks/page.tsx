"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import type { NetworkSummary } from "@rihtim/shared";
import { QueryErrorBanner } from "@/components/QueryErrorBanner";
import { Trash2, Plus, Search, Sparkles, Network } from "lucide-react";
import { EmptyRow, SkeletonRows } from "@/components/ui";
import { useT } from "@/i18n/provider";

const BUILTIN_NETWORKS = new Set(["bridge", "host", "none"]);

export default function NetworksPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { t } = useT();
  const { data, error, isFetching, isLoading, refetch } = useQuery({
    queryKey: ["networks"],
    queryFn: () => api<NetworkSummary[]>("/networks"),
  });
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [onlyCustom, setOnlyCustom] = useState(false);

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
        <h1 className="text-[22px] font-bold tracking-tight">{t("networks.title")}</h1>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            className="input w-auto"
            placeholder={t("networks.newPlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            onClick={() => name && create.mutate()}
            className="btn btn-primary"
          >
            <Plus className="w-4 h-4" /> {t("common.create")}
          </button>
          <button
            onClick={onPrune}
            disabled={prune.isPending}
            className="btn btn-secondary"
            title={t("networks.pruneHint")}
          >
            <Sparkles className="w-4 h-4" /> {t("networks.prune")}
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("common.filter")}
              className="input input-sm pl-7"
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
          <thead className="text-slate-500">
            <tr className="text-left">
              <th className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider">{t("networks.columns.name")}</th>
              <th className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider">{t("networks.columns.driver")}</th>
              <th className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider">{t("networks.columns.scope")}</th>
              <th className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider">{t("networks.columns.subnet")}</th>
              <th className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-right">{t("networks.columns.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {isLoading && <SkeletonRows cols={5} />}
            {rows.map((n) => {
              const builtin = BUILTIN_NETWORKS.has(n.name);
              return (
                <tr
                  key={n.id}
                  onClick={() => router.push(`/networks/${encodeURIComponent(n.id)}`)}
                  className="cursor-pointer hover:bg-slate-800/40 transition-colors"
                >
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{n.name}</span>
                      {builtin && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          built-in
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">{n.driver}</td>
                  <td className="px-4 py-3">{n.scope}</td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {n.ipam?.config?.map((c) => c.subnet).filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove.mutate(n.id);
                      }}
                      disabled={builtin}
                      title={builtin ? t("networks.builtinHint") : undefined}
                      className="btn btn-ghost btn-icon btn-sm"
                    >
                      <Trash2 className="w-4 h-4 text-rose-400" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && rows.length === 0 && (
              <EmptyRow
                colSpan={5}
                icon={Network}
                title={filter || onlyCustom ? t("common.noMatches") : t("networks.empty")}
                description={filter || onlyCustom ? t("common.noMatchesHint") : t("networks.emptyHint")}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
