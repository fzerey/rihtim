"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api, humanBytes } from "@/lib/api";
import { LogsPanel } from "@/components/LogsPanel";
import { StatsPanel } from "@/components/StatsPanel";
import { FileBrowser } from "@/components/FileBrowser";
import { TerminalPanel } from "@/components/TerminalPanel";
import { useT } from "@/i18n/provider";
import {
  ArrowLeft,
  Play,
  Square,
  RotateCw,
  Pause,
  Trash2,
  ChevronDown,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";

type Tab = "overview" | "logs" | "stats" | "exec" | "files" | "inspect";

const TABS: Tab[] = ["overview", "logs", "stats", "exec", "files", "inspect"];

export default function ContainerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("overview");
  const [pending, setPending] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["container", params.id],
    queryFn: () => api<any>(`/containers/${params.id}`),
    refetchInterval: 5000,
  });

  const action = useMutation({
    mutationFn: (verb: string) =>
      api(`/containers/${params.id}/${verb}`, { method: "POST" }),
    onMutate: (verb) => setPending(verb),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["container", params.id] });
      setTimeout(() => setPending(null), 1200);
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/containers/${params.id}?force=true`, { method: "DELETE" }),
    onSuccess: () => router.push("/containers"),
  });

  if (isLoading) return <div className="text-slate-400">{t("common.loading")}</div>;
  if (error) return <div className="text-rose-300">{(error as Error).message}</div>;
  if (!data) return null;

  const state = data.State ?? {};
  const cfg = data.Config ?? {};
  const hostCfg = data.HostConfig ?? {};
  const netCfg = data.NetworkSettings ?? {};
  const name = (data.Name ?? "").replace(/^\//, "");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/containers"
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold truncate">{name}</h1>
            <StateBadge state={state.Status} pending={pending} />
          </div>
          <div className="text-xs text-slate-500 font-mono truncate">
            {data.Id}
          </div>
        </div>
        <div className="flex gap-1">
          {state.Status === "paused" ? (
            <ActionBtn
              onClick={() => action.mutate("unpause")}
              icon={Play}
              label={t("containers.actions.unpause")}
            />
          ) : state.Status !== "running" ? (
            <ActionBtn
              onClick={() => action.mutate("start")}
              icon={Play}
              label={t("containers.actions.start")}
            />
          ) : (
            <ActionBtn
              onClick={() => action.mutate("stop")}
              icon={Square}
              label={t("containers.actions.stop")}
            />
          )}
          <ActionBtn
            onClick={() => action.mutate("restart")}
            icon={RotateCw}
            label={t("containers.actions.restart")}
          />
          {state.Status === "running" && (
            <ActionBtn
              onClick={() => action.mutate("pause")}
              icon={Pause}
              label={t("containers.actions.pause")}
            />
          )}
          <ActionBtn
            onClick={() => remove.mutate()}
            icon={Trash2}
            label={t("containers.actions.remove")}
            danger
          />
        </div>
      </div>

      <div className="border-b border-slate-800 flex gap-1">
        {TABS.map((id) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              "px-4 py-2 text-sm border-b-2 -mb-px",
              tab === id
                ? "border-brand-500 text-brand-200"
                : "border-transparent text-slate-400 hover:text-slate-200",
            )}
          >
            {t(`containers.detail.tabs.${id}`)}
          </button>
        ))}
      </div>

      <div>
        {tab === "overview" && <Overview data={data} cfg={cfg} hostCfg={hostCfg} netCfg={netCfg} state={state} />}
        {tab === "logs" && <LogsPanel containerId={data.Id} />}
        {tab === "stats" && <StatsPanel containerId={data.Id} />}
        {tab === "exec" && <TerminalPanel containerId={data.Id} running={state.Status === "running"} />}
        {tab === "files" && <FileBrowser containerId={data.Id} />}
        {tab === "inspect" && <InspectPanel data={data} />}
      </div>
    </div>
  );
}

const INSPECT_SECTIONS: Array<{ key: string; get: (d: any) => any }> = [
  {
    key: "general",
    get: (d) => ({
      Id: d.Id,
      Name: d.Name,
      Image: d.Config?.Image,
      ImageId: d.Image,
      Created: d.Created,
      Path: d.Path,
      Args: d.Args,
      Platform: d.Platform,
      Driver: d.Driver,
    }),
  },
  { key: "state", get: (d) => d.State },
  { key: "network", get: (d) => d.NetworkSettings },
  {
    key: "ports",
    get: (d) => ({
      PortBindings: d.HostConfig?.PortBindings,
      ExposedPorts: d.Config?.ExposedPorts,
      Ports: d.NetworkSettings?.Ports,
    }),
  },
  { key: "environment", get: (d) => d.Config?.Env },
  { key: "labels", get: (d) => d.Config?.Labels },
  { key: "mounts", get: (d) => ({ Mounts: d.Mounts, Binds: d.HostConfig?.Binds }) },
  {
    key: "resources",
    get: (d) => {
      const h = d.HostConfig ?? {};
      return {
        Memory: h.Memory,
        MemorySwap: h.MemorySwap,
        MemoryReservation: h.MemoryReservation,
        NanoCpus: h.NanoCpus,
        CpuShares: h.CpuShares,
        CpuQuota: h.CpuQuota,
        CpuPeriod: h.CpuPeriod,
        CpusetCpus: h.CpusetCpus,
        PidsLimit: h.PidsLimit,
      };
    },
  },
  { key: "restart", get: (d) => d.HostConfig?.RestartPolicy },
  { key: "logConfig", get: (d) => d.HostConfig?.LogConfig },
  { key: "health", get: (d) => d.State?.Health ?? d.Config?.Healthcheck },
  {
    key: "command",
    get: (d) => ({
      Entrypoint: d.Config?.Entrypoint,
      Cmd: d.Config?.Cmd,
      WorkingDir: d.Config?.WorkingDir,
      User: d.Config?.User,
      Tty: d.Config?.Tty,
      OpenStdin: d.Config?.OpenStdin,
    }),
  },
  { key: "security", get: (d) => ({
      Privileged: d.HostConfig?.Privileged,
      CapAdd: d.HostConfig?.CapAdd,
      CapDrop: d.HostConfig?.CapDrop,
      SecurityOpt: d.HostConfig?.SecurityOpt,
      ReadonlyRootfs: d.HostConfig?.ReadonlyRootfs,
      UsernsMode: d.HostConfig?.UsernsMode,
    }),
  },
  { key: "raw", get: (d) => d },
];

function isEmptyValue(v: any): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0 || Object.values(v).every(isEmptyValue);
  if (typeof v === "string") return v === "";
  return false;
}

function InspectPanel({ data }: { data: any }) {
  const { t } = useT();
  const [filter, setFilter] = useState("");
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [allOpen, setAllOpen] = useState(false);

  const needle = filter.trim().toLowerCase();
  const source = data ?? {};
  const sections = INSPECT_SECTIONS
    .map(({ key, get }) => {
      const raw = get(source);
      if (isEmptyValue(raw) && key !== "raw") return null;
      const label = t(`containers.detail.inspect.sections.${key}`);
      if (!needle) return { key, label, value: raw };
      if (label.toLowerCase().includes(needle) || key.toLowerCase().includes(needle)) {
        return { key, label, value: raw };
      }
      const sub = filterObject(raw, needle);
      return sub === undefined ? null : { key, label, value: sub };
    })
    .filter(Boolean) as Array<{ key: string; label: string; value: any }>;

  const copyAll = async () => {
    try {
      const payload = Object.fromEntries(sections.map((s) => [s.key, s.value]));
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard API can reject in insecure contexts
    }
  };

  const toggleAll = () => {
    const next = !allOpen;
    setAllOpen(next);
    setOpen(Object.fromEntries(sections.map((s) => [s.key, next])));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t("containers.detail.inspect.filterPlaceholder")}
          className="bg-slate-900 border border-slate-700 rounded-md px-2 py-1 text-sm flex-1 min-w-[180px]"
        />
        <button
          onClick={toggleAll}
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md px-3 py-1 text-sm"
        >
          {allOpen ? t("containers.detail.inspect.collapseAll") : t("containers.detail.inspect.expandAll")}
        </button>
        <button
          onClick={copyAll}
          className="bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-md px-3 py-1 text-sm"
        >
          {copied ? t("containers.detail.inspect.copied") : t("containers.detail.inspect.copy")}
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="text-sm text-slate-500 border border-slate-800 rounded-md p-3">
          {t("containers.detail.inspect.empty")}
        </div>
      ) : (
        <div className="space-y-2">
          {sections.map(({ key, label, value }) => {
            const isOpen = open[key] ?? false;
            return (
              <InspectSection
                key={key}
                name={label}
                value={value}
                open={isOpen}
                onToggle={() => setOpen((o) => ({ ...o, [key]: !isOpen }))}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function InspectSection({
  name,
  value,
  open,
  onToggle,
}: {
  name: string;
  value: any;
  open: boolean;
  onToggle: () => void;
}) {
  const kind = describeValue(value);
  return (
    <div className="border border-slate-800 rounded-md overflow-hidden bg-slate-900/40">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-800/60"
      >
        {open ? (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-slate-400" />
        )}
        <span className="font-medium text-slate-100">{name}</span>
        <span className="ml-auto text-xs text-slate-500 font-mono">{kind}</span>
      </button>
      {open && (
        <pre className="text-xs bg-black/40 border-t border-slate-800 p-3 overflow-auto max-h-[60vh] font-mono">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

function describeValue(v: any): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return `array(${v.length})`;
  if (typeof v === "object") return `object(${Object.keys(v).length})`;
  return typeof v;
}

function filterObject(value: any, needle: string): any {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    const arr = value
      .map((v) => filterObject(v, needle))
      .filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (typeof value === "object") {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      if (k.toLowerCase().includes(needle)) {
        out[k] = v;
        continue;
      }
      const sub = filterObject(v, needle);
      if (sub !== undefined) out[k] = sub;
    }
    return Object.keys(out).length ? out : undefined;
  }
  const s = String(value).toLowerCase();
  return s.includes(needle) ? value : undefined;
}

function Overview({
  data,
  cfg,
  hostCfg,
  netCfg,
  state,
}: {
  data: any;
  cfg: any;
  hostCfg: any;
  netCfg: any;
  state: any;
}) {
  const { t } = useT();
  const env: string[] = cfg.Env ?? [];
  const labels: Record<string, string> = cfg.Labels ?? {};
  const mounts: any[] = data.Mounts ?? [];
  const portBindings: Record<string, Array<{ HostIp?: string; HostPort?: string }>> =
    hostCfg.PortBindings ?? {};
  const networks = netCfg.Networks ?? {};

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Section title={t("containers.detail.sections.state")}>
        <KV k={t("containers.detail.fields.status")} v={state.Status} />
        <KV k={t("containers.detail.fields.started")} v={state.StartedAt} />
        <KV k={t("containers.detail.fields.finished")} v={state.FinishedAt} />
        <KV k={t("containers.detail.fields.exitCode")} v={String(state.ExitCode ?? "")} />
        <KV k={t("containers.detail.fields.restartCount")} v={String(data.RestartCount ?? 0)} />
      </Section>

      <Section title={t("containers.detail.sections.imageCmd")}>
        <KV k={t("containers.detail.fields.image")} v={cfg.Image} mono />
        <KV k={t("containers.detail.fields.imageId")} v={data.Image} mono />
        <KV k={t("containers.detail.fields.entrypoint")} v={(cfg.Entrypoint ?? []).join(" ")} mono />
        <KV k={t("containers.detail.fields.cmd")} v={(cfg.Cmd ?? []).join(" ")} mono />
        <KV k={t("containers.detail.fields.workingDir")} v={cfg.WorkingDir} mono />
        <KV k={t("containers.detail.fields.user")} v={cfg.User || "root"} />
      </Section>

      <Section title={t("containers.detail.sections.resources")}>
        <KV
          k={t("containers.detail.fields.restartPolicy")}
          v={hostCfg.RestartPolicy?.Name ?? "no"}
        />
        <KV
          k={t("containers.detail.fields.memory")}
          v={hostCfg.Memory ? humanBytes(hostCfg.Memory) : t("common.unlimited")}
        />
        <KV k={t("containers.detail.fields.cpuShares")} v={String(hostCfg.CpuShares ?? 0)} />
        <KV k={t("containers.detail.fields.nanoCpus")} v={String(hostCfg.NanoCpus ?? 0)} />
        <KV k={t("containers.detail.fields.privileged")} v={String(hostCfg.Privileged ?? false)} />
      </Section>

      <Section title={t("containers.detail.sections.ports")}>
        {Object.keys(portBindings).length === 0 ? (
          <div className="text-slate-500 text-xs">{t("containers.detail.noPortBindings")}</div>
        ) : (
          <div className="space-y-1 text-xs font-mono">
            {Object.entries(portBindings).map(([containerPort, hosts]) => {
              const proto = containerPort.split("/")[1] ?? "tcp";
              const uniqueHosts = Array.from(
                new Map(
                  hosts.map((h) => {
                    const ip = h.HostIp || "0.0.0.0";
                    const port = h.HostPort ?? "";
                    return [`${ip}:${port}`, { ip, port }] as const;
                  }),
                ).values(),
              );
              return (
                <div key={containerPort}>
                  <span className="text-brand-300">{containerPort}</span> →{" "}
                  {uniqueHosts.map((h, i) => {
                    const label = `${h.ip}:${h.port}`;
                    const clickable = proto === "tcp" && h.port;
                    return (
                      <span key={label}>
                        {i > 0 && ", "}
                        {clickable ? (
                          <a
                            href={`http://localhost:${h.port}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-300 hover:underline"
                          >
                            {label}
                          </a>
                        ) : (
                          label
                        )}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={t("containers.detail.sections.env", { count: env.length })}>
        {env.length === 0 ? (
          <div className="text-slate-500 text-xs">{t("containers.detail.noEnv")}</div>
        ) : (
          <div className="max-h-64 overflow-auto space-y-1 text-xs font-mono">
            {env.map((e, i) => {
              const [k, ...rest] = e.split("=");
              return (
                <div key={i} className="grid grid-cols-[10rem_1fr] gap-2">
                  <span className="text-slate-400 truncate">{k}</span>
                  <span className="text-slate-200 break-all">{rest.join("=")}</span>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={t("containers.detail.sections.mounts", { count: mounts.length })}>
        {mounts.length === 0 ? (
          <div className="text-slate-500 text-xs">{t("containers.detail.noMounts")}</div>
        ) : (
          <div className="space-y-1 text-xs font-mono">
            {mounts.map((m, i) => (
              <div key={i}>
                <span className="text-slate-400">{m.Type}</span>{" "}
                <span className="text-slate-500">{m.Source}</span> →{" "}
                <span className="text-brand-300">{m.Destination}</span>{" "}
                <span className="text-slate-600">({m.Mode})</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={t("containers.detail.sections.networks", { count: Object.keys(networks).length })}
      >
        <div className="space-y-2 text-xs">
          {Object.entries<any>(networks).map(([n, cfg]) => (
            <div key={n} className="rounded border border-slate-800 p-2">
              <div className="font-medium text-slate-200">{n}</div>
              <div className="grid grid-cols-2 gap-1 mt-1 text-slate-400 font-mono">
                <div>IP: {cfg.IPAddress || "-"}</div>
                <div>Gateway: {cfg.Gateway || "-"}</div>
                <div>MAC: {cfg.MacAddress || "-"}</div>
                <div>NetworkID: {(cfg.NetworkID ?? "").slice(0, 12)}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title={t("containers.detail.sections.labels", { count: Object.keys(labels).length })}
      >
        {Object.keys(labels).length === 0 ? (
          <div className="text-slate-500 text-xs">{t("containers.detail.noLabels")}</div>
        ) : (
          <div className="max-h-40 overflow-auto text-xs font-mono space-y-0.5">
            {Object.entries(labels).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[10rem_1fr] gap-2">
                <span className="text-slate-400 truncate">{k}</span>
                <span className="text-slate-200 break-all">{v}</span>
              </div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-sm font-medium mb-3 text-slate-200">{title}</div>
      <div className="space-y-1 text-sm">{children}</div>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v?: string; mono?: boolean }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-2 text-xs">
      <span className="text-slate-500">{k}</span>
      <span className={clsx("break-all", mono && "font-mono")}>{v || "—"}</span>
    </div>
  );
}

function StateBadge({ state, pending }: { state?: string; pending?: string | null }) {
  const { t, tf } = useT();
  if (pending) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-sky-500/20 text-sky-300 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-300" />
        {t(`containers.pending.${pending}`)}
      </span>
    );
  }
  const cls =
    state === "running"
      ? "bg-emerald-500/20 text-emerald-300"
      : state === "paused"
        ? "bg-amber-500/20 text-amber-300"
        : "bg-slate-700/40 text-slate-300";
  const label = state ? tf(`containers.state.${state}`, state) : "";
  return <span className={clsx("px-2 py-0.5 rounded-full text-xs", cls)}>{label}</span>;
}

function ActionBtn({
  onClick,
  icon: Icon,
  label,
  danger,
}: {
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={clsx(
        "p-2 rounded-md hover:bg-slate-800 flex items-center gap-1 text-sm",
        danger && "text-rose-400 hover:bg-rose-950/40",
      )}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
