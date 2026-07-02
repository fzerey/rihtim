"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, timeAgo } from "@/lib/api";
import type { ContainerSummary } from "@rihtim/shared";
import { QueryErrorBanner } from "@/components/QueryErrorBanner";
import {
  Play,
  Square,
  RotateCw,
  Trash2,
  Pause,
  ScrollText,
  ChevronDown,
  ChevronRight,
  Layers,
  Box,
  Search,
} from "lucide-react";
import { LogsDrawer } from "@/components/LogsDrawer";
import { useT } from "@/i18n/provider";
import clsx from "clsx";

const COMPOSE_LABEL = "com.docker.compose.project";
const STANDALONE = "__standalone__";

type Group = { key: string; project: string | null; items: ContainerSummary[] };

export default function ContainersPage() {
  const qc = useQueryClient();
  const { t, locale } = useT();
  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ["containers"],
    queryFn: () => api<ContainerSummary[]>("/containers?all=true"),
  });

  const [logsFor, setLogsFor] = useState<ContainerSummary | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");

  const clearPending = (id: string) => {
    setPending((p) => {
      if (!(id in p)) return p;
      const { [id]: _, ...rest } = p;
      return rest;
    });
  };

  const action = useMutation({
    mutationFn: async ({ id, verb }: { id: string; verb: string }) =>
      api(`/containers/${id}/${verb}`, { method: "POST" }),
    onMutate: ({ id, verb }) => {
      setPending((p) => ({ ...p, [id]: verb }));
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ["containers"] });
      setTimeout(() => clearPending(vars.id), 1200);
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/containers/${id}?force=true`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["containers"] }),
  });

  const prune = useMutation({
    mutationFn: () => api("/containers/prune", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["containers"] }),
  });

  const groups: Group[] = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? data.filter((c) => {
          const names = c.names.map((n) => n.replace(/^\//, "").toLowerCase());
          const project = (c.labels?.[COMPOSE_LABEL] ?? "").toLowerCase();
          const service = (c.labels?.["com.docker.compose.service"] ?? "").toLowerCase();
          return (
            names.some((n) => n.includes(q)) ||
            c.image.toLowerCase().includes(q) ||
            c.id.toLowerCase().includes(q) ||
            project.includes(q) ||
            service.includes(q)
          );
        })
      : data;
    const map = new Map<string, Group>();
    for (const c of filtered) {
      const project = c.labels?.[COMPOSE_LABEL] ?? null;
      const key = project ?? STANDALONE;
      let g = map.get(key);
      if (!g) {
        g = { key, project, items: [] };
        map.set(key, g);
      }
      g.items.push(c);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.project === null) return 1;
      if (b.project === null) return -1;
      return a.project.localeCompare(b.project);
    });
  }, [data, filter]);

  async function bulk(verb: "start" | "stop" | "restart" | "remove", items: ContainerSummary[]) {
    if (verb === "remove") {
      await Promise.all(items.map((c) => remove.mutateAsync(c.id)));
    } else {
      await Promise.all(items.map((c) => action.mutateAsync({ id: c.id, verb })));
    }
  }

  return (
    <div className="space-y-4">
      <QueryErrorBanner error={error} isFetching={isFetching} onRetry={() => refetch()} />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("containers.title")}</h1>
          <p className="text-sm text-slate-400">
            {t("containers.total", { count: data?.length ?? 0 })}
          </p>
        </div>
        <button
          onClick={() => prune.mutate()}
          className="px-3 py-1.5 rounded-md text-sm bg-slate-800 hover:bg-slate-700"
        >
          {t("containers.prune")}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("common.filter")}
            className="w-full bg-slate-950 border border-slate-800 rounded pl-7 pr-2 py-1.5 text-xs"
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

      {isLoading && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-slate-500 text-sm">
          {t("common.loading")}
        </div>
      )}

      <div className="space-y-3">
        {groups.map((g) => {
          const isCollapsed = collapsed[g.key] ?? false;
          const running = g.items.filter((c) => c.state === "running").length;
          const isProject = g.project !== null;
          const anyRunning = running > 0;
          const anyStopped = g.items.some((c) => c.state !== "running");
          return (
            <div
              key={g.key}
              className="rounded-xl border border-slate-800 overflow-hidden bg-slate-950/40"
            >
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-900/70 border-b border-slate-800">
                <button
                  onClick={() => setCollapsed((s) => ({ ...s, [g.key]: !isCollapsed }))}
                  className="p-1 rounded hover:bg-slate-800 text-slate-400"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>
                {isProject ? (
                  <Layers className="w-4 h-4 text-brand-400" />
                ) : (
                  <Box className="w-4 h-4 text-slate-500" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {isProject ? g.project : t("containers.group.standalone")}
                  </div>
                  <div className="text-xs text-slate-500">
                    {t("containers.group.summary", {
                      running,
                      total: g.items.length,
                    })}
                  </div>
                </div>
                {isProject && (
                  <div className="flex gap-1">
                    {anyStopped && (
                      <IconBtn
                        onClick={() => bulk("start", g.items)}
                        title={t("containers.group.startAll")}
                      >
                        <Play className="w-4 h-4" />
                      </IconBtn>
                    )}
                    {anyRunning && (
                      <IconBtn
                        onClick={() => bulk("stop", g.items)}
                        title={t("containers.group.stopAll")}
                      >
                        <Square className="w-4 h-4" />
                      </IconBtn>
                    )}
                    <IconBtn
                      onClick={() => bulk("restart", g.items)}
                      title={t("containers.group.restartAll")}
                    >
                      <RotateCw className="w-4 h-4" />
                    </IconBtn>
                    <IconBtn
                      onClick={() => bulk("remove", g.items)}
                      title={t("containers.group.removeAll")}
                    >
                      <Trash2 className="w-4 h-4 text-rose-400" />
                    </IconBtn>
                  </div>
                )}
              </div>

              {!isCollapsed && (
                <table className="w-full text-sm">
                  <thead className="text-slate-400">
                    <tr className="text-left">
                      <th className="px-4 py-2 font-normal text-xs">
                        {t("containers.columns.name")}
                      </th>
                      <th className="px-4 py-2 font-normal text-xs">
                        {t("containers.columns.image")}
                      </th>
                      <th className="px-4 py-2 font-normal text-xs">
                        {t("containers.columns.state")}
                      </th>
                      <th className="px-4 py-2 font-normal text-xs">
                        {t("containers.columns.ports")}
                      </th>
                      <th className="px-4 py-2 font-normal text-xs">
                        {t("containers.columns.created")}
                      </th>
                      <th className="px-4 py-2 font-normal text-xs">
                        {t("containers.columns.lastRun")}
                      </th>
                      <th className="px-4 py-2 font-normal text-xs text-right">
                        {t("containers.columns.actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {g.items.map((c) => {
                      const service = c.labels?.["com.docker.compose.service"];
                      const displayName = c.names
                        .map((n) => n.replace(/^\//, ""))
                        .join(", ");
                      return (
                        <tr key={c.id} className="hover:bg-slate-900/40">
                          <td className="px-4 py-2 font-medium">
                            <Link
                              href={`/containers/${c.id}`}
                              className="hover:text-brand-300"
                            >
                              {service ?? displayName}
                            </Link>
                            <div className="text-xs text-slate-500 font-mono">
                              {service ? displayName + " • " : ""}
                              {c.id.slice(0, 12)}
                            </div>
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">{c.image}</td>
                          <td className="px-4 py-2">
                            <StateCell state={c.state} pending={pending[c.id]} />
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">
                            <PortsCell ports={c.ports} />
                          </td>
                          <td className="px-4 py-2 text-slate-400">
                            {t("containers.ago", { value: timeAgo(c.createdAt, locale) })}
                          </td>
                          <td className="px-4 py-2 text-slate-400">
                            <LastRunCell status={c.status} state={c.state} />
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex gap-1 justify-end">
                              {c.state === "paused" ? (
                                <IconBtn
                                  onClick={() => action.mutate({ id: c.id, verb: "unpause" })}
                                  title={t("containers.actions.unpause")}
                                >
                                  <Play className="w-4 h-4" />
                                </IconBtn>
                              ) : c.state !== "running" ? (
                                <IconBtn
                                  onClick={() => action.mutate({ id: c.id, verb: "start" })}
                                  title={t("containers.actions.start")}
                                >
                                  <Play className="w-4 h-4" />
                                </IconBtn>
                              ) : (
                                <IconBtn
                                  onClick={() => action.mutate({ id: c.id, verb: "stop" })}
                                  title={t("containers.actions.stop")}
                                >
                                  <Square className="w-4 h-4" />
                                </IconBtn>
                              )}
                              <IconBtn
                                onClick={() => action.mutate({ id: c.id, verb: "restart" })}
                                title={t("containers.actions.restart")}
                              >
                                <RotateCw className="w-4 h-4" />
                              </IconBtn>
                              {c.state === "running" && (
                                <IconBtn
                                  onClick={() => action.mutate({ id: c.id, verb: "pause" })}
                                  title={t("containers.actions.pause")}
                                >
                                  <Pause className="w-4 h-4" />
                                </IconBtn>
                              )}
                              <IconBtn
                                onClick={() => setLogsFor(c)}
                                title={t("containers.actions.logs")}
                              >
                                <ScrollText className="w-4 h-4" />
                              </IconBtn>
                              <IconBtn
                                onClick={() => remove.mutate(c.id)}
                                title={t("containers.actions.remove")}
                              >
                                <Trash2 className="w-4 h-4 text-rose-400" />
                              </IconBtn>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>

      {logsFor && <LogsDrawer container={logsFor} onClose={() => setLogsFor(null)} />}
    </div>
  );
}

function IconBtn({
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button {...rest} className="p-1.5 rounded-md hover:bg-slate-800 text-slate-300">
      {children}
    </button>
  );
}

function LastRunCell({ status, state }: { status: string; state: string }) {
  if (!status) return <span className="text-slate-500">—</span>;
  const cls =
    state === "running"
      ? "text-emerald-300/90"
      : state === "paused"
        ? "text-amber-300/90"
        : "text-slate-400";
  return <span className={cls}>{status}</span>;
}

function StateCell({ state, pending }: { state: string; pending?: string }) {
  const { t, tf } = useT();
  if (pending) {
    const label = t(`containers.pending.${pending}`);
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-sky-500/20 text-sky-300 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-300" />
        {label}
      </span>
    );
  }
  const cls =
    state === "running"
      ? "bg-emerald-500/20 text-emerald-300"
      : state === "paused"
        ? "bg-amber-500/20 text-amber-300"
        : "bg-slate-700/40 text-slate-300";
  const label = tf(`containers.state.${state}`, state);
  return <span className={clsx("px-2 py-0.5 rounded-full text-xs", cls)}>{label}</span>;
}

function PortsCell({ ports }: { ports: ContainerSummary["ports"] }) {
  const pubs = ports.filter((p) => p.publicPort);
  const unique = Array.from(
    new Map(
      pubs.map((p) => [`${p.publicPort}:${p.privatePort}/${p.type}`, p] as const),
    ).values(),
  );
  if (!unique.length) return <>-</>;
  return (
    <>
      {unique.map((p, i) => {
        const label = `${p.publicPort}:${p.privatePort}/${p.type}`;
        const clickable = p.type === "tcp";
        return (
          <span key={label}>
            {i > 0 && ", "}
            {clickable ? (
              <a
                href={`http://localhost:${p.publicPort}`}
                target="_blank"
                rel="noreferrer"
                className="text-brand-300 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                {label}
              </a>
            ) : (
              label
            )}
          </span>
        );
      })}
    </>
  );
}
