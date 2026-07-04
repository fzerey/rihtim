"use client";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Copy, Trash2 } from "lucide-react";
import { api, humanBytes } from "@/lib/api";
import { useT } from "@/i18n/provider";
import { FileBrowser } from "@/components/FileBrowser";
import type { VolumeSummary } from "@rihtim/shared";

interface VolumeInspect {
  Name: string;
  Driver?: string;
  Mountpoint?: string;
  CreatedAt?: string;
  Scope?: string;
  Labels?: Record<string, string> | null;
  Options?: Record<string, string> | null;
  Status?: Record<string, unknown> | null;
}

export function VolumeDetailView({ volumeName }: { volumeName: string }) {
  const { t } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"details" | "files">("details");

  const { data, isLoading, error } = useQuery({
    queryKey: ["volume", volumeName],
    queryFn: () => api<VolumeInspect>(`/volumes/${encodeURIComponent(volumeName)}`),
  });

  const list = useQuery({
    queryKey: ["volumes"],
    queryFn: () => api<VolumeSummary[]>("/volumes"),
  });
  const summary = list.data?.find((v) => v.name === volumeName);

  const remove = useMutation({
    mutationFn: () =>
      api(`/volumes/${encodeURIComponent(volumeName)}?force=true`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["volumes"] });
      router.push("/volumes");
    },
  });

  const driver = summary?.driver ?? data?.Driver;
  const scope = summary?.scope ?? data?.Scope;
  const inUse = (summary?.refCount ?? 0) > 0;

  // Tear down the helper container that mounts the volume when leaving the page.
  useEffect(() => {
    return () => {
      api(`/volumes/${encodeURIComponent(volumeName)}/helper`, {
        method: "DELETE",
      }).catch(() => undefined);
    };
  }, [volumeName]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/volumes"
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{volumeName}</h1>
          <div className="text-xs text-slate-500 font-mono truncate">
            {[driver, scope].filter(Boolean).join(" · ")}
          </div>
        </div>
        <button
          onClick={() => remove.mutate()}
          disabled={remove.isPending || inUse}
          title={inUse ? t("volumes.inUseHint") : undefined}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-600/90 hover:bg-rose-600 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-4 h-4" />
          {t("volumes.detail.remove")}
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-800">
        <TabButton
          active={tab === "details"}
          onClick={() => setTab("details")}
          label={t("volumes.detail.tabDetails")}
        />
        <TabButton
          active={tab === "files"}
          onClick={() => setTab("files")}
          label={t("volumes.detail.tabFiles")}
        />
      </div>

      {tab === "details" && (
        <div className="space-y-6">
          {isLoading && <div className="text-sm text-slate-400">{t("common.loading")}</div>}
          {error && <div className="text-sm text-rose-400">{(error as Error).message}</div>}

          <Section title={t("volumes.detail.general")}>
            <KV label={t("volumes.columns.name")} value={volumeName} />
            <KV label={t("volumes.columns.driver")} value={driver} />
            <KV label={t("volumes.columns.scope")} value={scope} />
            <KV
              label={t("volumes.columns.size")}
              value={
                typeof summary?.size === "number" && summary.size >= 0
                  ? humanBytes(summary.size)
                  : undefined
              }
            />
            <KV label={t("volumes.columns.usedBy")} value={String(summary?.refCount ?? 0)} />
            <KV
              label={t("volumes.detail.created")}
              value={
                data?.CreatedAt
                  ? new Date(data.CreatedAt).toLocaleString()
                  : summary?.createdAt
                    ? new Date(summary.createdAt).toLocaleString()
                    : undefined
              }
            />
            <KV
              label={t("volumes.detail.mountpoint")}
              value={data?.Mountpoint ?? summary?.mountpoint}
            />
          </Section>

          {data?.Options && Object.keys(data.Options).length > 0 && (
            <Section title={t("volumes.detail.options")}>
              <KVMap map={data.Options} />
            </Section>
          )}

          {data?.Labels && Object.keys(data.Labels).length > 0 && (
            <Section title={t("volumes.detail.labels")}>
              <KVMap map={data.Labels} />
            </Section>
          )}

          {data && (
            <details className="text-xs">
              <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
                {t("volumes.detail.rawJson")}
              </summary>
              <div className="mt-2 relative">
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
                  }
                  className="absolute top-2 right-2 p-1 rounded hover:bg-slate-800"
                  title={t("common.copy")}
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <pre className="bg-slate-900/60 border border-slate-800 rounded p-3 overflow-auto max-h-96 text-slate-300">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </div>
            </details>
          )}
        </div>
      )}

      {tab === "files" && (
        <div>
          <div className="text-xs text-slate-500 mb-3">
            {t("volumes.detail.filesHint")}
          </div>
          <FileBrowser
            apiBase={`/volumes/${encodeURIComponent(volumeName)}`}
            editable
          />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-3 py-1.5 text-sm border-b-2 -mb-px transition " +
        (active
          ? "border-brand-500 text-slate-100"
          : "border-transparent text-slate-400 hover:text-slate-200")
      }
    >
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-medium text-slate-200 mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">{children}</div>
    </section>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-xs text-slate-200 font-mono truncate">
        {value === undefined || value === null || value === "" ? (
          <span className="text-slate-600">—</span>
        ) : (
          value
        )}
      </div>
    </>
  );
}

function KVMap({ map }: { map: Record<string, string> }) {
  return (
    <div className="col-span-full space-y-1 font-mono text-xs">
      {Object.entries(map).map(([k, v]) => (
        <div key={k} className="flex gap-3">
          <span className="text-slate-500 shrink-0">{k}</span>
          <span className="text-slate-200 break-all">{v}</span>
        </div>
      ))}
    </div>
  );
}
