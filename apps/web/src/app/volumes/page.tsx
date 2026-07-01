"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { VolumeSummary } from "@rihtim/shared";
import { Trash2, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useT } from "@/i18n/provider";

export default function VolumesPage() {
  const qc = useQueryClient();
  const { t } = useT();
  const { data } = useQuery({
    queryKey: ["volumes"],
    queryFn: () => api<VolumeSummary[]>("/volumes"),
  });

  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("volumes.title")}</h1>
        <div className="flex gap-2">
          <input
            className="bg-slate-950 border border-slate-800 rounded-md px-3 py-1.5 text-sm"
            placeholder={t("volumes.newPlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            onClick={() => name && create.mutate()}
            className="px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-500 text-sm flex items-center gap-1"
          >
            <Plus className="w-4 h-4" /> {t("common.create")}
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
          {filter && (
            <button
              onClick={() => setFilter("")}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              {t("common.clear")}
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-900/70 text-slate-400">
            <tr className="text-left">
              <th className="px-4 py-2">{t("volumes.columns.name")}</th>
              <th className="px-4 py-2">{t("volumes.columns.driver")}</th>
              <th className="px-4 py-2">{t("volumes.columns.mount")}</th>
              <th className="px-4 py-2 text-right">{t("volumes.columns.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/40">
            {data
              ?.filter((v) => {
                const q = filter.trim().toLowerCase();
                if (!q) return true;
                return (
                  v.name.toLowerCase().includes(q) ||
                  v.driver.toLowerCase().includes(q) ||
                  v.mountpoint.toLowerCase().includes(q)
                );
              })
              .map((v) => (
              <tr key={v.name}>
                <td className="px-4 py-2 font-medium">{v.name}</td>
                <td className="px-4 py-2">{v.driver}</td>
                <td className="px-4 py-2 font-mono text-xs">{v.mountpoint}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => remove.mutate(v.name)}
                    className="p-1.5 rounded hover:bg-slate-800"
                  >
                    <Trash2 className="w-4 h-4 text-rose-400" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
