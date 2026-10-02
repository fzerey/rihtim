"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import type { VolumeSummary } from "@rihtim/shared";
import { Plus, Search, Trash2, Sparkles, HardDrive } from "lucide-react";
import { EmptyRow, SkeletonRows } from "@/components/ui";
import { api, humanBytes } from "@/lib/api";
import { QueryErrorBanner } from "@/components/QueryErrorBanner";
import { useT } from "@/i18n/provider";

export default function VolumesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { t } = useT();
  const { data, error, isFetching, isLoading, refetch } = useQuery({
    queryKey: ["volumes"],
    queryFn: () => api<VolumeSummary[]>("/volumes"),
  });

  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
  const [onlyUnused, setOnlyUnused] = useState(false);

  const create = useMutation({
    mutationFn: () => api("/volumes", { method: "POST", json: { Name: name } }),
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["volumes"] });
    },
  });
  const remove = useMutation({
    mutationFn: (n: string) =>
      api(`/volumes/${encodeURIComponent(n)}?force=true`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["volumes"] }),
  });
  const prune = useMutation({
    mutationFn: () => api<{ SpaceReclaimed?: number }>("/volumes/prune", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["volumes"] }),
  });

  const rows = useMemo(() => {
    const list = data ?? [];
    const q = filter.trim().toLowerCase();
    return list.filter((v) => {
      if (onlyUnused && (v.refCount ?? 0) > 0) return false;
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        v.driver.toLowerCase().includes(q) ||
        v.mountpoint.toLowerCase().includes(q)
      );
    });
  }, [data, filter, onlyUnused]);

  const totals = useMemo(() => {
    const list = data ?? [];
    const size = list.reduce(
      (sum, v) => sum + (typeof v.size === "number" && v.size > 0 ? v.size : 0),
      0,
    );
    const unused = list.filter((v) => (v.refCount ?? 0) === 0).length;
    return { count: list.length, size, unused };
  }, [data]);

  const onPrune = () => {
    if (window.confirm(t("volumes.pruneConfirm"))) prune.mutate();
  };

  return (
    <div className="space-y-4">
      <QueryErrorBanner error={error} isFetching={isFetching} onRetry={() => refetch()} />
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{t("volumes.title")}</h1>
          <div className="text-xs text-slate-400 mt-1">
            {t("volumes.summary", {
              count: totals.count,
              size: humanBytes(totals.size),
              unused: totals.unused,
            })}
          </div>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          <input
            className="input w-auto"
            placeholder={t("volumes.newPlaceholder")}
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
            disabled={prune.isPending || totals.unused === 0}
            className="btn btn-secondary"
            title={t("volumes.pruneHint")}
          >
            <Sparkles className="w-4 h-4" /> {t("volumes.prune")}
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
              checked={onlyUnused}
              onChange={(e) => setOnlyUnused(e.target.checked)}
              className="accent-brand-500"
            />
            {t("volumes.onlyUnused")}
          </label>
          {(filter || onlyUnused) && (
            <button
              onClick={() => {
                setFilter("");
                setOnlyUnused(false);
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
              <th className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider">{t("volumes.columns.name")}</th>
              <th className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider">{t("volumes.columns.driver")}</th>
              <th className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider">{t("volumes.columns.mount")}</th>
              <th className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-right">{t("volumes.columns.size")}</th>
              <th className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-right">{t("volumes.columns.usedBy")}</th>
              <th className="px-4 pt-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-right">{t("volumes.columns.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {isLoading && <SkeletonRows cols={6} />}
            {rows.map((v) => {
              const inUse = (v.refCount ?? 0) > 0;
              return (
                <tr
                  key={v.name}
                  onClick={() => router.push(`/volumes/${encodeURIComponent(v.name)}`)}
                  className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium">
                    <span className="text-brand-300 hover:underline">{v.name}</span>
                  </td>
                  <td className="px-4 py-3">{v.driver}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{v.mountpoint}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {typeof v.size === "number" && v.size >= 0 ? (
                      humanBytes(v.size)
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={
                        inUse
                          ? "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/15 text-emerald-300"
                          : "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-800 text-slate-400"
                      }
                    >
                      {v.refCount ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        remove.mutate(v.name);
                      }}
                      disabled={inUse}
                      title={inUse ? t("volumes.inUseHint") : undefined}
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
                colSpan={6}
                icon={HardDrive}
                title={filter || onlyUnused ? t("common.noMatches") : t("volumes.empty")}
                description={filter || onlyUnused ? t("common.noMatchesHint") : t("volumes.emptyHint")}
              />
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
