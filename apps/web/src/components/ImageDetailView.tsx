"use client";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Copy,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  ExternalLink,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { api, humanBytes, timeAgo } from "@/lib/api";
import { useT } from "@/i18n/provider";
import type {
  ImageHistoryEntry,
  ImageScanResult,
  VulnerabilitySeverity,
} from "@rihtim/shared";

interface ImageInspect {
  Id: string;
  RepoTags?: string[];
  RepoDigests?: string[];
  Parent?: string;
  Created?: string;
  Author?: string;
  Architecture?: string;
  Os?: string;
  Size?: number;
  DockerVersion?: string;
  Config?: {
    Env?: string[];
    Cmd?: string[];
    Entrypoint?: string[];
    WorkingDir?: string;
    User?: string;
    ExposedPorts?: Record<string, unknown>;
    Labels?: Record<string, string>;
    Volumes?: Record<string, unknown>;
  };
  RootFS?: { Type?: string; Layers?: string[] };
}

const SEVERITY_ORDER: VulnerabilitySeverity[] = [
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "UNKNOWN",
];

const SEVERITY_STYLES: Record<VulnerabilitySeverity, string> = {
  CRITICAL: "bg-rose-500/20 text-rose-300 border-rose-500/40",
  HIGH: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  MEDIUM: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  LOW: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  UNKNOWN: "bg-slate-700/40 text-slate-300 border-slate-600/40",
};

export function ImageDetailView({ imageId }: { imageId: string }) {
  const { t } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"details" | "scan">("details");

  const { data, isLoading, error } = useQuery({
    queryKey: ["image", imageId],
    queryFn: () => api<ImageInspect>(`/images/${encodeURIComponent(imageId)}`),
  });

  const history = useQuery({
    queryKey: ["image-history", imageId],
    queryFn: () =>
      api<ImageHistoryEntry[]>(`/images/${encodeURIComponent(imageId)}/history`),
  });

  const remove = useMutation({
    mutationFn: () =>
      api(`/images/${encodeURIComponent(imageId)}?force=true`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["images"] });
      router.push("/images");
    },
  });

  const title = data?.RepoTags?.find((tg) => tg && tg !== "<none>:<none>") ??
    imageId.replace("sha256:", "").slice(0, 12);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/images"
          className="p-1.5 rounded hover:bg-slate-800 text-slate-400"
        >
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">{title}</h1>
          <div className="text-xs text-slate-500 font-mono truncate">
            {imageId.replace("sha256:", "").slice(0, 19)}
          </div>
        </div>
        <button
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-rose-600/90 hover:bg-rose-600 text-white text-sm disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          {t("images.detail.remove")}
        </button>
      </div>

      <div className="flex gap-1 border-b border-slate-800">
        <TabButton
          active={tab === "details"}
          onClick={() => setTab("details")}
          label={t("images.detail.tabDetails")}
        />
        <TabButton
          active={tab === "scan"}
          onClick={() => setTab("scan")}
          label={t("images.detail.tabScan")}
        />
      </div>

      {isLoading && <div className="text-sm text-slate-400">{t("common.loading")}</div>}
      {error && <div className="text-sm text-rose-400">{(error as Error).message}</div>}

      {data && tab === "details" && (
        <DetailsTab data={data} history={history.data} imageId={imageId} />
      )}
      {data && tab === "scan" && <ScanTab imageId={imageId} imageRef={title} />}
    </div>
  );
}

function DetailsTab({
  data,
  history,
  imageId,
}: {
  data: ImageInspect;
  history?: ImageHistoryEntry[];
  imageId: string;
}) {
  const { t } = useT();
  const cfg = data.Config ?? {};
  const exposed = Object.keys(cfg.ExposedPorts ?? {});
  const volumes = Object.keys(cfg.Volumes ?? {});

  return (
    <div className="p-4 space-y-6">
      <Section title={t("images.detail.general")}>
        <KV label={t("images.columns.tag")} value={data.RepoTags?.join(", ")} />
        <KV
          label={t("images.detail.digest")}
          value={data.RepoDigests?.[0]?.split("@")[1]?.slice(0, 19)}
        />
        <KV label={t("images.columns.size")} value={humanBytes(data.Size ?? 0)} />
        <KV label={t("images.detail.os")} value={data.Os} />
        <KV label={t("images.detail.architecture")} value={data.Architecture} />
        <KV label={t("images.detail.dockerVersion")} value={data.DockerVersion} />
        <KV
          label={t("images.detail.created")}
          value={data.Created ? new Date(data.Created).toLocaleString() : undefined}
        />
        <KV label={t("images.detail.author")} value={data.Author} />
      </Section>

      <Section title={t("images.detail.config")}>
        <KV label="User" value={cfg.User} />
        <KV label="WorkingDir" value={cfg.WorkingDir} />
        <KV
          label="Entrypoint"
          value={cfg.Entrypoint?.length ? cfg.Entrypoint.join(" ") : undefined}
        />
        <KV label="Cmd" value={cfg.Cmd?.length ? cfg.Cmd.join(" ") : undefined} />
        <KV
          label={t("images.detail.exposedPorts")}
          value={exposed.length ? exposed.join(", ") : undefined}
        />
        <KV
          label={t("images.detail.volumes")}
          value={volumes.length ? volumes.join(", ") : undefined}
        />
      </Section>

      {cfg.Env && cfg.Env.length > 0 && (
        <Section title={t("images.detail.env")}>
          <div className="col-span-full space-y-1 font-mono text-xs">
            {cfg.Env.map((e) => {
              const idx = e.indexOf("=");
              const k = idx >= 0 ? e.slice(0, idx) : e;
              const v = idx >= 0 ? e.slice(idx + 1) : "";
              return (
                <div key={e} className="flex gap-3">
                  <span className="text-slate-500 shrink-0">{k}</span>
                  <span className="text-slate-200 break-all">{v}</span>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {cfg.Labels && Object.keys(cfg.Labels).length > 0 && (
        <Section title={t("images.detail.labels")}>
          <div className="col-span-full space-y-1 font-mono text-xs">
            {Object.entries(cfg.Labels).map(([k, v]) => (
              <div key={k} className="flex gap-3">
                <span className="text-slate-500 shrink-0">{k}</span>
                <span className="text-slate-200 break-all">{v}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {history && history.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-slate-200 mb-2">
            {t("images.detail.layers", { count: history.length })}
          </h3>
          <div className="space-y-1">
            {history.map((h, i) => (
              <div
                key={`${h.id ?? "layer"}-${i}`}
                className="flex items-start gap-3 text-xs bg-slate-900/40 border border-slate-800 rounded px-2 py-1.5"
              >
                <span className="text-slate-500 shrink-0 w-16 text-right">
                  {humanBytes(h.size)}
                </span>
                <code className="text-slate-300 break-all whitespace-pre-wrap flex-1">
                  {cleanLayerCmd(h.createdBy)}
                </code>
              </div>
            ))}
          </div>
        </section>
      )}

      <details className="text-xs">
        <summary className="cursor-pointer text-slate-400 hover:text-slate-200">
          {t("images.detail.rawJson")}
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

      <div className="text-[10px] text-slate-600 font-mono break-all">{imageId}</div>
    </div>
  );
}

function ScanTab({ imageId, imageRef }: { imageId: string; imageRef: string }) {
  const { t, locale } = useT();
  const qc = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<VulnerabilitySeverity | "ALL">(
    "ALL",
  );

  const cached = useQuery({
    queryKey: ["image-scan", imageId],
    queryFn: () =>
      api<ImageScanResult | undefined>(
        `/images/${encodeURIComponent(imageId)}/scan`,
      ),
  });

  const scan = useMutation({
    mutationFn: () =>
      api<ImageScanResult>(`/images/${encodeURIComponent(imageId)}/scan`, {
        method: "POST",
      }),
    onSuccess: (data) => {
      qc.setQueryData(["image-scan", imageId], data);
    },
  });

  const result = scan.data ?? cached.data ?? undefined;
  const hasResult = !!result;

  const rows = useMemo(() => {
    if (!result) return [];
    const all = result.targets.flatMap((tg) =>
      tg.vulnerabilities.map((v) => ({ ...v, target: tg.target })),
    );
    const filtered =
      severityFilter === "ALL"
        ? all
        : all.filter((v) => v.severity === severityFilter);
    const rank = (s: VulnerabilitySeverity) => SEVERITY_ORDER.indexOf(s);
    return filtered.sort((a, b) => rank(a.severity) - rank(b.severity));
  }, [result, severityFilter]);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="text-xs text-slate-400 max-w-sm space-y-1">
          <div>{t("images.scan.description")}</div>
          {hasResult && result && (
            <div className="text-[11px] text-slate-500">
              {t("images.scan.lastScanned", {
                value: timeAgo(result.scannedAt, locale),
              })}
            </div>
          )}
        </div>
        <button
          onClick={() => scan.mutate()}
          disabled={scan.isPending}
          className="shrink-0 px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-500 text-sm inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {scan.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : hasResult ? (
            <RefreshCw className="w-4 h-4" />
          ) : (
            <ShieldCheck className="w-4 h-4" />
          )}
          {scan.isPending
            ? t("images.scan.scanning")
            : hasResult
              ? t("images.scan.rescan")
              : t("images.scan.start")}
        </button>
      </div>

      {scan.isPending && (
        <div className="text-xs text-slate-500 bg-slate-900/40 border border-slate-800 rounded px-3 py-2">
          {t("images.scan.hint")}
        </div>
      )}

      {scan.error && (
        <div className="text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded px-3 py-2">
          {(scan.error as Error).message}
        </div>
      )}

      {result && (
        <>
          <div className="flex flex-wrap gap-2">
            <SummaryBadge
              label={t("images.scan.total")}
              count={result.total}
              onClick={() => setSeverityFilter("ALL")}
              active={severityFilter === "ALL"}
              tone="bg-slate-800 text-slate-200 border-slate-700"
            />
            {SEVERITY_ORDER.map((sev) => (
              <SummaryBadge
                key={sev}
                label={sev}
                count={result.summary[sev] ?? 0}
                onClick={() => setSeverityFilter(sev)}
                active={severityFilter === sev}
                tone={SEVERITY_STYLES[sev]}
              />
            ))}
          </div>

          {result.total === 0 ? (
            <div className="flex items-center gap-2 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded px-3 py-3">
              <ShieldCheck className="w-4 h-4" />
              {t("images.scan.clean")}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-slate-500">{t("images.scan.noneForFilter")}</div>
          ) : (
            <div className="space-y-1.5">
              {rows.map((v, i) => (
                <div
                  key={`${v.vulnerabilityId}-${v.pkgName}-${i}`}
                  className="bg-slate-900/40 border border-slate-800 rounded px-3 py-2"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={
                        "inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border " +
                        SEVERITY_STYLES[v.severity]
                      }
                    >
                      {v.severity}
                    </span>
                    {v.primaryUrl ? (
                      <a
                        href={v.primaryUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-xs text-brand-300 hover:underline inline-flex items-center gap-1"
                      >
                        {v.vulnerabilityId}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="font-mono text-xs text-slate-300">
                        {v.vulnerabilityId}
                      </span>
                    )}
                    <span className="font-mono text-xs text-slate-400">
                      {v.pkgName} {v.installedVersion}
                    </span>
                    {v.fixedVersion && (
                      <span className="text-[10px] text-emerald-300">
                        {t("images.scan.fixedIn", { version: v.fixedVersion })}
                      </span>
                    )}
                  </div>
                  {v.title && (
                    <div className="text-xs text-slate-500 mt-1">{v.title}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!result && !scan.isPending && !scan.error && !cached.isLoading && (
        <div className="flex flex-col items-center justify-center gap-2 py-10 text-slate-500">
          <ShieldAlert className="w-8 h-8" />
          <div className="text-sm">{t("images.scan.idle")}</div>
          <div className="text-xs font-mono text-slate-600">{imageRef}</div>
        </div>
      )}
    </div>
  );
}

function SummaryBadge({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "px-2.5 py-1 rounded-md text-xs border inline-flex items-center gap-1.5 transition " +
        tone +
        (active ? " ring-2 ring-brand-500/60" : " opacity-80 hover:opacity-100")
      }
    >
      <span>{label}</span>
      <span className="font-semibold">{count}</span>
    </button>
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

function cleanLayerCmd(cmd: string): string {
  return cmd.replace(/^\/bin\/sh -c #\(nop\)\s*/, "").replace(/^\/bin\/sh -c\s*/, "RUN ");
}
