"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, humanBytes, timeAgo } from "@/lib/api";
import type { SystemInfo, DockerEvent, SystemStorage } from "@rihtim/shared";
import { Boxes, Image, Database, Network, Cpu, MemoryStick, Activity, HardDrive, type LucideIcon } from "lucide-react";
import { useT } from "@/i18n/provider";

function Card({
  title,
  value,
  hint,
  icon: Icon,
  href,
}: {
  title: string;
  value: string | number;
  hint?: string;
  icon: LucideIcon;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <div className="text-sm text-slate-400">{title}</div>
        <Icon className="w-4 h-4 text-slate-500" />
      </div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
      {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 block transition hover:bg-slate-900 hover:border-slate-700 hover:-translate-y-0.5"
      >
        {body}
      </Link>
    );
  }
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
      {body}
    </div>
  );
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t("dashboard.title")}</h1>
        <p className="text-sm text-slate-400">{t("dashboard.subtitle")}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <Card
          title={t("dashboard.cards.containers")}
          value={data?.containers ?? "—"}
          hint={t("dashboard.cards.containersHint", {
            running: data?.containersRunning ?? 0,
            stopped: data?.containersStopped ?? 0,
          })}
          icon={Boxes}
          href="/containers"
        />
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
          icon={Database}
        />
        <Card
          title={t("dashboard.cards.kernel")}
          value={data?.kernelVersion ?? "—"}
          icon={Network}
        />
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <div className="text-sm text-slate-400 mb-2">{t("dashboard.engine")}</div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-slate-500">{t("dashboard.serverVersion")}</div>
            <div>{data?.serverVersion ?? "—"}</div>
          </div>
          <div>
            <div className="text-slate-500">{t("dashboard.name")}</div>
            <div>{data?.name ?? "—"}</div>
          </div>
          <div className="col-span-2">
            <div className="text-slate-500">{t("dashboard.dockerRoot")}</div>
            <div className="font-mono text-xs">{data?.dockerRootDir ?? "—"}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="w-4 h-4 text-brand-400" />
          <div className="flex-1">
            <div className="text-sm font-medium">{t("dashboard.storage.title")}</div>
            <div className="text-xs text-slate-500">
              {t("dashboard.storage.subtitle", {
                total: storage.data ? humanBytes(storage.data.totalSize) : "—",
                reclaimable: storage.data ? humanBytes(storage.data.totalReclaimable) : "—",
              })}
            </div>
          </div>
        </div>
        {storage.isError && (
          <div className="text-xs text-rose-300">{t("dashboard.storage.error")}</div>
        )}
        {storage.data && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <StorageRow
              label={t("dashboard.storage.images")}
              cat={storage.data.images}
              t={t}
            />
            <StorageRow
              label={t("dashboard.storage.containers")}
              cat={storage.data.containers}
              t={t}
            />
            <StorageRow
              label={t("dashboard.storage.volumes")}
              cat={storage.data.volumes}
              t={t}
            />
            <StorageRow
              label={t("dashboard.storage.buildCache")}
              cat={storage.data.buildCache}
              t={t}
            />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-brand-400" />
          <div>
            <div className="text-sm font-medium">{t("dashboard.events.title")}</div>
            <div className="text-xs text-slate-500">
              {t("dashboard.events.subtitle", { minutes: EVENT_MINUTES })}
            </div>
          </div>
        </div>
        {events.isError && (
          <div className="text-xs text-rose-300">{t("dashboard.events.error")}</div>
        )}
        {events.data && events.data.length === 0 && (
          <div className="text-xs text-slate-500">{t("dashboard.events.empty")}</div>
        )}
        {events.data && events.data.length > 0 && (
          <ul className="divide-y divide-slate-800 -mx-5">
            {events.data.map((e, i) => (
              <li key={`${e.time}-${e.id ?? ""}-${i}`} className="flex items-center gap-3 px-5 py-1.5 text-xs">
                <EventBadge type={e.type} action={e.action} />
                <div className="flex-1 min-w-0 truncate">
                  <span className="text-slate-300">{e.name ?? e.image ?? (e.id ? e.id.slice(0, 12) : "—")}</span>
                  {e.image && e.name && (
                    <span className="text-slate-500 font-mono ml-1.5">{e.image}</span>
                  )}
                </div>
                <span className="text-slate-500 shrink-0">
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

function EventBadge({ type, action }: { type: string; action: string }) {
  const positive = new Set(["start", "create", "pull", "attach", "connect", "mount"]);
  const negative = new Set(["die", "kill", "stop", "remove", "destroy", "delete", "detach", "disconnect", "unmount", "oom"]);
  const neutral = new Set(["restart", "pause", "unpause", "rename", "update", "commit", "tag", "untag"]);
  const cls = positive.has(action)
    ? "bg-emerald-500/15 text-emerald-300"
    : negative.has(action)
    ? "bg-rose-500/15 text-rose-300"
    : neutral.has(action)
    ? "bg-amber-500/15 text-amber-300"
    : "bg-slate-700/40 text-slate-300";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono ${cls}`}>
      <span className="opacity-60">{type}</span>
      <span>{action}</span>
    </span>
  );
}

function StorageRow({
  label,
  cat,
  t,
}: {
  label: string;
  cat: import("@rihtim/shared").StorageCategory;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const pct = cat.size > 0 ? Math.min(100, (cat.reclaimable / cat.size) * 100) : 0;
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-center justify-between text-xs">
        <div className="text-slate-300 font-medium">{label}</div>
        <div className="text-slate-500">
          {t("dashboard.storage.count", { active: cat.active, total: cat.total })}
        </div>
      </div>
      <div className="mt-1 text-sm font-semibold">{humanBytes(cat.size)}</div>
      <div className="mt-1 text-[10px] text-slate-500">
        {t("dashboard.storage.reclaimable", { value: humanBytes(cat.reclaimable) })}
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full bg-amber-500/70"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
