"use client";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, humanBytes, timeAgo } from "@/lib/api";
import type { SystemInfo, DockerEvent, SystemStorage, StorageCategory } from "@rihtim/shared";
import { Boxes, Image, Database, Terminal, Cpu, MemoryStick, Activity, HardDrive, Server, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import { useT } from "@/i18n/provider";

const panel = "rounded-2xl border border-slate-800 bg-slate-900";

function Card({
  title,
  value,
  hint,
  icon: Icon,
  href,
  children,
  mono,
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  href?: string;
  children?: ReactNode;
  mono?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
        <Icon className="w-4 h-4 text-slate-500" strokeWidth={1.75} />
      </div>
      <div
        className={clsx(
          "mt-3 font-semibold tracking-tight truncate",
          mono ? "font-mono text-lg" : "text-[26px] leading-none",
        )}
        title={String(value)}
      >
        {value}
      </div>
      {children}
      {hint && <div className="text-xs text-slate-400 mt-2 truncate">{hint}</div>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={clsx(panel, "p-5 block transition-colors hover:border-slate-700 hover:bg-slate-800/40")}
      >
        {body}
      </Link>
    );
  }
  return <div className={clsx(panel, "p-5")}>{body}</div>;
}

export default function DashboardPage() {
  const { t, locale } = useT();
  const { data } = useQuery({
    queryKey: ["system", "info"],
    queryFn: () => api<SystemInfo>("/system/info"),
  });

  const EVENT_MINUTES = 15;
  const events = useQuery({
    queryKey: ["system", "events", EVENT_MINUTES],
    queryFn: () => api<DockerEvent[]>(`/system/events?minutes=${EVENT_MINUTES}&limit=25`),
    refetchInterval: 5_000,
  });

  const storage = useQuery({
    queryKey: ["system", "storage"],
    queryFn: () => api<SystemStorage>("/system/storage"),
    refetchInterval: 30_000,
  });

  const runningPct =
    data && data.containers > 0 ? (data.containersRunning / data.containers) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-sm text-slate-400 mt-0.5">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <Card
          title={t("dashboard.cards.containers")}
          value={data?.containers ?? "—"}
          hint={t("dashboard.cards.containersHint", {
            running: data?.containersRunning ?? 0,
            stopped: data?.containersStopped ?? 0,
          })}
          icon={Boxes}
          href="/containers"
        >
          <div className="mt-3 h-1.5 rounded-full bg-slate-800 overflow-hidden">
            <div className="h-full bg-emerald-500" style={{ width: `${runningPct}%` }} />
          </div>
        </Card>
        <Card
          title={t("dashboard.cards.images")}
          value={data?.images ?? "—"}
          icon={Image}
          href="/images"
        />
        <Card title={t("dashboard.cards.cpu")} value={data?.ncpu ?? "—"} icon={Cpu} />
        <Card
          title={t("dashboard.cards.memory")}
          value={data ? humanBytes(data.memTotal) : "—"}
          icon={MemoryStick}
        />
        <Card
          title={t("dashboard.cards.os")}
          value={data?.operatingSystem?.split(" ")[0] ?? "—"}
          hint={data?.architecture}
          icon={Server}
        />
        <Card
          title={t("dashboard.cards.kernel")}
          value={data?.kernelVersion ?? "—"}
          icon={Terminal}
          mono
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-start">
        <div className={clsx(panel, "p-5 lg:col-span-2")}>
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-brand-400" strokeWidth={1.75} />
            <div className="text-sm font-semibold">{t("dashboard.engine")}</div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 text-sm">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t("dashboard.serverVersion")}
              </dt>
              <dd className="mt-1 font-mono">{data?.serverVersion ?? "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t("dashboard.name")}
              </dt>
              <dd className="mt-1 font-mono truncate">{data?.name ?? "—"}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t("dashboard.dockerRoot")}
              </dt>
              <dd className="mt-1 font-mono text-xs text-slate-300 break-all">
                {data?.dockerRootDir ?? "—"}
              </dd>
            </div>
          </dl>
        </div>

        <div className={clsx(panel, "p-5 lg:col-span-3")}>
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-brand-400" strokeWidth={1.75} />
              <div className="text-sm font-semibold">{t("dashboard.storage.title")}</div>
            </div>
            <div className="text-xs text-slate-400">
              {t("dashboard.storage.subtitle", {
                total: storage.data ? humanBytes(storage.data.totalSize) : "—",
                reclaimable: storage.data ? humanBytes(storage.data.totalReclaimable) : "—",
              })}
            </div>
          </div>
          {storage.isError && (
            <div className="mt-3 text-xs text-rose-300">{t("dashboard.storage.error")}</div>
          )}
          {storage.data && <StorageBreakdown storage={storage.data} />}
        </div>
      </div>

      <div className={clsx(panel, "p-5")}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-400" strokeWidth={1.75} />
            <div className="text-sm font-semibold">{t("dashboard.events.title")}</div>
          </div>
          <div className="text-xs text-slate-400">
            {t("dashboard.events.subtitle", { minutes: EVENT_MINUTES })}
          </div>
        </div>
        {events.isError && (
          <div className="mt-3 text-xs text-rose-300">{t("dashboard.events.error")}</div>
        )}
        {events.data && events.data.length === 0 && (
          <div className="mt-3 text-xs text-slate-500">{t("dashboard.events.empty")}</div>
        )}
        {events.data && events.data.length > 0 && (
          <ul className="mt-2 divide-y divide-slate-800">
            {events.data.map((e, i) => (
              <li
                key={`${e.time}-${e.id ?? ""}-${i}`}
                className="flex items-center gap-3 py-2.5 text-[13px]"
              >
                <span className={clsx("w-2 h-2 rounded-full shrink-0", eventDot(e.action))} />
                <div className="flex-1 min-w-0 truncate">
                  <span className="font-mono text-slate-200">
                    {e.name ?? e.image ?? (e.id ? e.id.slice(0, 12) : "—")}
                  </span>
                  {e.image && e.name && (
                    <span className="text-slate-500 font-mono ml-2 text-xs">{e.image}</span>
                  )}
                </div>
                <span className="font-mono text-xs text-slate-400 shrink-0">
                  <span className="text-slate-500">{e.type}</span> {e.action}
                </span>
                <span className="text-xs text-slate-500 shrink-0 w-20 text-right">
                  {timeAgo(e.time, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const POSITIVE = new Set(["start", "create", "pull", "attach", "connect", "mount"]);
const NEGATIVE = new Set(["die", "kill", "stop", "remove", "destroy", "delete", "detach", "disconnect", "unmount", "oom"]);
const NEUTRAL = new Set(["restart", "pause", "unpause", "rename", "update", "commit", "tag", "untag"]);

function eventDot(action: string) {
  if (POSITIVE.has(action)) return "bg-emerald-500";
  if (NEGATIVE.has(action)) return "bg-rose-500";
  if (NEUTRAL.has(action)) return "bg-amber-500";
  return "bg-slate-500";
}

function StorageBreakdown({ storage }: { storage: SystemStorage }) {
  const { t } = useT();
  const rows: { label: string; cat: StorageCategory; color: string }[] = [
    { label: t("dashboard.storage.images"), cat: storage.images, color: "bg-brand-400" },
    { label: t("dashboard.storage.containers"), cat: storage.containers, color: "bg-emerald-500" },
    { label: t("dashboard.storage.volumes"), cat: storage.volumes, color: "bg-amber-500" },
    { label: t("dashboard.storage.buildCache"), cat: storage.buildCache, color: "bg-slate-500" },
  ];
  const total = storage.totalSize;
  return (
    <>
      <div className="mt-4 flex h-2.5 rounded-full bg-slate-800 overflow-hidden gap-0.5">
        {total > 0 &&
          rows.map(
            (r) =>
              r.cat.size > 0 && (
                <div
                  key={r.label}
                  className={r.color}
                  style={{ width: `${(r.cat.size / total) * 100}%` }}
                  title={`${r.label}: ${humanBytes(r.cat.size)}`}
                />
              ),
          )}
      </div>
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <span className={clsx("w-2 h-2 rounded-full shrink-0", r.color)} />
              <span className="truncate">{r.label}</span>
            </div>
            <div className="mt-1 text-sm font-semibold">{humanBytes(r.cat.size)}</div>
            <div className="text-[11px] text-slate-500">
              {t("dashboard.storage.count", { active: r.cat.active, total: r.cat.total })}
            </div>
            <div className="text-[11px] text-slate-500">
              {t("dashboard.storage.reclaimable", { value: humanBytes(r.cat.reclaimable) })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
