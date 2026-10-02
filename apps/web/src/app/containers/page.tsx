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
  Boxes,
} from "lucide-react";
import { LogsDrawer } from "@/components/LogsDrawer";
import { EmptyState, TableSkeleton } from "@/components/ui";
import { formatAgo, formatDuration, parseDockerStatus } from "@/lib/dockerStatus";
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
    const targets = items.filter((c) => {
      switch (verb) {
        case "start":
          return c.state !== "running" && c.state !== "restarting" && c.state !== "paused";
        case "stop":
        case "restart":
          return c.state === "running";
        case "remove":
          return true;
      }
    });
    if (targets.length === 0) return;
    if (verb === "remove") {
      await Promise.all(targets.map((c) => remove.mutateAsync(c.id)));
    } else {
      await Promise.all(targets.map((c) => action.mutateAsync({ id: c.id, verb })));
    }
  }

  return (
    <div className="space-y-4">
      <QueryErrorBanner error={error} isFetching={isFetching} onRetry={() => refetch()} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-bold tracking-tight">{t("containers.title")}</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            {t("containers.total", { count: data?.length ?? 0 })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("common.filter")}
              aria-label={t("common.filter")}
              className="w-full h-9 bg-slate-900 border border-slate-800 rounded-lg pl-9 pr-3 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-400/60"
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
          <button
            onClick={() => prune.mutate()}
            className="h-9 px-3.5 rounded-lg text-sm font-medium border border-slate-800 bg-slate-900 hover:bg-slate-800 transition-colors"
          >
            {t("containers.prune")}
          </button>
        </div>
      </div>

      {isLoading && <TableSkeleton rows={5} cols={6} />}

      {data && data.length === 0 && (
        <EmptyState
          icon={Boxes}
          title={t("containers.empty.title")}
          description={t("containers.empty.description")}
          action={
            <Link href="/images" className="btn btn-primary">
              <Layers className="w-4 h-4" />
              {t("containers.empty.action")}
            </Link>
          }
        />
      )}

      {data && data.length > 0 && groups.length === 0 && (
        <EmptyState
          icon={Search}
          title={t("common.noMatches")}
          description={t("common.noMatchesHint")}
        />
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
              className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-900"
            >
              <div
                className={clsx(
                  "flex items-center gap-2 px-3 py-2.5",
                  !isCollapsed && "border-b border-slate-800",
                )}
              >
                <button
                  onClick={() => setCollapsed((s) => ({ ...s, [g.key]: !isCollapsed }))}
                  aria-expanded={!isCollapsed}
                  className="p-1 rounded-md hover:bg-slate-800 text-slate-400"
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
                  <div className="text-sm font-semibold truncate">
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
                  <thead className="text-slate-500">
                    <tr className="text-left">
                      <th className="px-4 pt-3 pb-2 font-semibold text-[11px] uppercase tracking-wider">
                        {t("containers.columns.name")}
                      </th>
                      <th className="px-4 pt-3 pb-2 font-semibold text-[11px] uppercase tracking-wider">
                        {t("containers.columns.image")}
                      </th>
                      <th className="px-4 pt-3 pb-2 font-semibold text-[11px] uppercase tracking-wider">
                        {t("containers.columns.state")}
                      </th>
                      <th className="px-4 pt-3 pb-2 font-semibold text-[11px] uppercase tracking-wider">
                        {t("containers.columns.ports")}
                      </th>
                      <th className="px-4 pt-3 pb-2 font-semibold text-[11px] uppercase tracking-wider">
                        {t("containers.columns.created")}
                      </th>
                      <th className="px-4 pt-3 pb-2 font-semibold text-[11px] uppercase tracking-wider">
                        {t("containers.columns.lastRun")}
                      </th>
                      <th className="px-4 pt-3 pb-2 font-semibold text-[11px] uppercase tracking-wider text-right">
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
                        <tr key={c.id} className="hover:bg-slate-800/40 transition-colors">
                          <td className="px-4 py-3 font-medium">
                            <Link
                              href={`/containers/${c.id}`}
                              title={service ?? displayName}
                              className="block max-w-[16rem] truncate hover:text-brand-300 transition-colors"
                            >
                              {service ?? displayName}
                            </Link>
                            <div
                              className="max-w-[16rem] truncate text-xs text-slate-500 font-mono"
                              title={(service ? displayName + " • " : "") + c.id.slice(0, 12)}
                            >
                              {service ? displayName + " • " : ""}
                              {c.id.slice(0, 12)}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-300">
                            <span className="block max-w-[14rem] truncate" title={c.image}>
                              {c.image}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <StateCell state={c.state} pending={pending[c.id]} />
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">
                            <PortsCell ports={c.ports} />
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {t("containers.ago", { value: timeAgo(c.createdAt, locale) })}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            <LastRunCell status={c.status} />
                          </td>
                          <td className="px-4 py-3">
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
    <button
      aria-label={rest.title}
      {...rest}
      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
    >
      {children}
    </button>
  );
}

function LastRunCell({ status }: { status: string }) {
  const { t, tf, locale } = useT();
  if (!status) return <span className="text-slate-500">—</span>;
  const p = parseDockerStatus(status);
  if (p.kind === "up") {
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap" title={status}>
        <span className="text-slate-300">
          {p.duration
            ? t("containers.lastRun.upFor", { duration: formatDuration(p.duration, locale) })
            : status}
        </span>
        {p.health && <HealthBadge health={p.health} />}
      </span>
    );
  }
  if (p.kind === "exited" || p.kind === "restarting") {
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap" title={status}>
        <span
          className={clsx(
            "px-1.5 py-0.5 rounded font-mono text-[11px]",
            p.exitCode === 0 ? "bg-slate-800 text-slate-300" : "bg-rose-500/15 text-rose-300",
          )}
        >
          {t("containers.lastRun.exitCode", { code: p.exitCode ?? 0 })}
        </span>
        {p.duration && <span>{formatAgo(p.duration, locale)}</span>}
      </span>
    );
  }
  return <span title={status}>{tf(`containers.state.${p.kind}`, status)}</span>;
}

function HealthBadge({ health }: { health: "healthy" | "unhealthy" | "starting" }) {
  const { t } = useT();
  const cls =
    health === "healthy"
      ? "bg-emerald-500/15 text-emerald-300"
      : health === "unhealthy"
        ? "bg-rose-500/15 text-rose-300"
        : "bg-amber-500/15 text-amber-300";
  return (
    <span className={clsx("px-1.5 py-0.5 rounded text-[11px] font-medium", cls)}>
      {t(`containers.health.${health}`)}
    </span>
  );
}

function StateCell({ state, pending }: { state: string; pending?: string }) {
  const { t, tf } = useT();
  if (pending) {
    const label = t(`containers.pending.${pending}`);
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-brand-500/15 text-brand-300 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
        {label}
      </span>
    );
  }
  const [pill, dot] =
    state === "running"
      ? ["bg-emerald-500/15 text-emerald-300", "bg-emerald-400"]
      : state === "paused" || state === "restarting"
        ? ["bg-amber-500/15 text-amber-300", "bg-amber-400"]
        : state === "exited" || state === "dead"
          ? ["bg-rose-500/15 text-rose-300", "bg-rose-400"]
          : ["bg-slate-800 text-slate-300", "bg-slate-500"];
  const label = tf(`containers.state.${state}`, state);
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium",
        pill,
      )}
    >
      <span className={clsx("w-1.5 h-1.5 rounded-full", dot)} />
      {label}
    </span>
  );
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
