"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { NetworkSummary } from "@rihtim/shared";
import { Trash2, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useT } from "@/i18n/provider";

export default function NetworksPage() {
  const qc = useQueryClient();
  const { t } = useT();
  const { data } = useQuery({
    queryKey: ["networks"],
    queryFn: () => api<NetworkSummary[]>("/networks"),
  });
  const [name, setName] = useState("");
  const [filter, setFilter] = useState("");

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t("networks.title")}</h1>
        <div className="flex gap-2">
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
              <th className="px-4 py-2">{t("networks.columns.name")}</th>
              <th className="px-4 py-2">{t("networks.columns.driver")}</th>
              <th className="px-4 py-2">{t("networks.columns.scope")}</th>
              <th className="px-4 py-2">{t("networks.columns.subnet")}</th>
              <th className="px-4 py-2 text-right">{t("networks.columns.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/40">
            {data
              ?.filter((n) => {
                const q = filter.trim().toLowerCase();
                if (!q) return true;
                return (
                  n.name.toLowerCase().includes(q) ||
                  n.driver.toLowerCase().includes(q) ||
                  n.scope.toLowerCase().includes(q)
                );
              })
              .map((n) => (
              <tr key={n.id}>
                <td className="px-4 py-2 font-medium">{n.name}</td>
                <td className="px-4 py-2">{n.driver}</td>
                <td className="px-4 py-2">{n.scope}</td>
                <td className="px-4 py-2 font-mono text-xs">
                  {n.ipam?.config?.map((c) => c.subnet).filter(Boolean).join(", ") ?? "-"}
                </td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => remove.mutate(n.id)}
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
