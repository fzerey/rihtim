"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, humanBytes, timeAgo } from "@/lib/api";
import type { ImageSummary, ContainerSummary } from "@rihtim/shared";
import { Trash2, Download, Search, Star, BadgeCheck, ExternalLink, ChevronDown, ArrowUp, ArrowDown, Play, X } from "lucide-react";
import { useT } from "@/i18n/provider";

type HubResult = {
  name: string;
  description: string;
  isOfficial: boolean;
  isAutomated: boolean;
  starCount: number;
};

type HubTag = {
  name: string;
  lastUpdated?: string;
  size?: number;
};

export default function ImagesPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const { t, locale } = useT();
  const { data } = useQuery({
    queryKey: ["images"],
    queryFn: () => api<ImageSummary[]>("/images"),
  });

  const { data: containers } = useQuery({
    queryKey: ["containers"],
    queryFn: () => api<ContainerSummary[]>("/containers"),
    refetchInterval: 5_000,
  });

  const usage = (() => {
    const map = new Map<string, { total: number; running: number }>();
    for (const c of containers ?? []) {
      const entry = map.get(c.imageId) ?? { total: 0, running: 0 };
      entry.total += 1;
      if (c.state === "running") entry.running += 1;
      map.set(c.imageId, entry);
    }
    return map;
  })();

  const pulledSet = (() => {
    const set = new Set<string>();
    for (const img of data ?? []) {
      for (const tag of img.repoTags) {
        if (!tag || tag === "<none>:<none>") continue;
        set.add(tag);
        if (tag.startsWith("library/")) set.add(tag.slice("library/".length));
      }
    }
    return set;
  })();

  const [pulling, setPulling] = useState(false);

  const [hubTerm, setHubTerm] = useState("");
  const [hubQuery, setHubQuery] = useState("");

  const [filter, setFilter] = useState("");

  type SortKey = "tag" | "size" | "created" | "pulled" | "inUse";
  const [sortKey, setSortKey] = useState<SortKey>("pulled");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "tag" ? "asc" : "desc");
    }
  }

  const sortedImages = (() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    const base = q
      ? data.filter((img) => {
          const tagMatch = img.repoTags.some((t) => t.toLowerCase().includes(q));
          const idMatch = img.id.toLowerCase().includes(q);
          return tagMatch || idMatch;
        })
      : data;
    const rows = [...base];
    const dir = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortKey === "tag") {
        const av = (a.repoTags[0] ?? "").toLowerCase();
        const bv = (b.repoTags[0] ?? "").toLowerCase();
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0;
      }
      if (sortKey === "size") return (a.size - b.size) * dir;
      if (sortKey === "inUse") {
        const au = usage.get(a.id)?.total ?? 0;
        const bu = usage.get(b.id)?.total ?? 0;
        return (au - bu) * dir;
      }
      if (sortKey === "pulled") {
        const av = a.pulledAt ?? a.createdAt;
        const bv = b.pulledAt ?? b.createdAt;
        return (av - bv) * dir;
      }
      return (a.createdAt - b.createdAt) * dir;
    });
    return rows;
  })();

  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  const [runTarget, setRunTarget] = useState<ImageSummary | null>(null);
  useEffect(() => {
    setPage(1);
  }, [sortKey, sortDir, pageSize, data?.length, filter]);

  const totalRows = sortedImages.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / pageSize));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * pageSize;
  const pagedImages = sortedImages.slice(start, start + pageSize);
  const rangeFrom = totalRows === 0 ? 0 : start + 1;
  const rangeTo = Math.min(start + pageSize, totalRows);

  useEffect(() => {
    const trimmed = hubTerm.trim();
    const handle = setTimeout(() => {
      setHubQuery(trimmed.length >= 2 ? trimmed : "");
    }, 300);
    return () => clearTimeout(handle);
  }, [hubTerm]);

  const hubSearch = useQuery({
    queryKey: ["hub-search", hubQuery],
    queryFn: () => api<HubResult[]>(`/images/search?term=${encodeURIComponent(hubQuery)}&limit=25`),
    enabled: hubQuery.length > 0,
    staleTime: 60_000,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/images/${encodeURIComponent(id)}?force=true`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["images"] }),
  });

  async function doPull(image: string, tag: string) {
    setPulling(true);
    try {
      const res = await fetch("/api/images/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromImage: image, tag: tag || "latest" }),
      });
      const reader = res.body?.getReader();
      while (reader) {
        const { done } = await reader.read();
        if (done) break;
      }
    } finally {
      setPulling(false);
      qc.invalidateQueries({ queryKey: ["images"] });
    }
  }

  function runHubSearch() {
    setHubQuery(hubTerm.trim());
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{t("images.title")}</h1>

      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="text-sm text-slate-400 mb-2">{t("images.hub.section")}</div>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
          <input
            className="w-full bg-slate-950 border border-slate-800 rounded-md pl-9 pr-3 py-1.5 text-sm"
            placeholder={t("images.hub.placeholder")}
            value={hubTerm}
            onChange={(e) => setHubTerm(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") runHubSearch();
            }}
            autoComplete="off"
          />
          {hubSearch.isFetching && hubQuery && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">
              {t("images.hub.loading")}
            </div>
          )}
        </div>

        {hubTerm.trim().length === 0 && (
          <div className="mt-3 text-xs text-slate-500">{t("images.hub.idle")}</div>
        )}
        {hubTerm.trim().length > 0 && hubTerm.trim().length < 2 && (
          <div className="mt-3 text-xs text-slate-500">{t("images.hub.typeMore")}</div>
        )}
        {hubQuery !== "" && hubSearch.data && hubSearch.data.length === 0 && !hubSearch.isFetching && (
          <div className="mt-3 text-xs text-slate-500">{t("images.hub.empty")}</div>
        )}
        {hubQuery !== "" && hubSearch.error && (
          <div className="mt-3 text-xs text-rose-300">{(hubSearch.error as Error).message}</div>
        )}
        {hubSearch.data && hubSearch.data.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-800 border border-slate-800 rounded-md overflow-hidden max-h-[420px] overflow-y-auto">
            {hubSearch.data.map((r) => (
              <HubItem
                key={r.name}
                item={r}
                onPull={doPull}
                pulling={pulling}
                pulledTags={pulledSet}
              />
            ))}
          </ul>
        )}
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
              <th className="px-4 py-2">
                <SortHeader label={t("images.columns.tag")} active={sortKey === "tag"} dir={sortDir} onClick={() => toggleSort("tag")} />
              </th>
              <th className="px-4 py-2">{t("images.columns.id")}</th>
              <th className="px-4 py-2">
                <SortHeader label={t("images.columns.size")} active={sortKey === "size"} dir={sortDir} onClick={() => toggleSort("size")} />
              </th>
              <th className="px-4 py-2">
                <SortHeader label={t("images.columns.inUse")} active={sortKey === "inUse"} dir={sortDir} onClick={() => toggleSort("inUse")} />
              </th>
              <th className="px-4 py-2">
                <SortHeader label={t("images.columns.created")} active={sortKey === "created"} dir={sortDir} onClick={() => toggleSort("created")} />
              </th>
              <th className="px-4 py-2">
                <SortHeader label={t("images.columns.pulled")} active={sortKey === "pulled"} dir={sortDir} onClick={() => toggleSort("pulled")} />
              </th>
              <th className="px-4 py-2 text-right">{t("images.columns.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/40">
            {pagedImages.map((img) => (
              <tr key={img.id} className="hover:bg-slate-900/40">
                <td className="px-4 py-2 font-mono text-xs">
                  {img.repoTags.length ? img.repoTags.join(", ") : "<none>"}
                </td>
                <td className="px-4 py-2 font-mono text-xs">
                  {img.id.replace("sha256:", "").slice(0, 12)}
                </td>
                <td className="px-4 py-2">{humanBytes(img.size)}</td>
                <td className="px-4 py-2">
                  <InUseBadge usage={usage.get(img.id)} />
                </td>
                <td className="px-4 py-2 text-slate-400">
                  {t("containers.ago", { value: timeAgo(img.createdAt, locale) })}
                </td>
                <td className="px-4 py-2 text-slate-400">
                  {img.pulledAt
                    ? t("containers.ago", { value: timeAgo(img.pulledAt, locale) })
                    : "—"}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="inline-flex items-center gap-1">
                    <button
                      onClick={() => setRunTarget(img)}
                      title={t("images.run")}
                      className="p-1.5 rounded hover:bg-slate-800"
                    >
                      <Play className="w-4 h-4 text-emerald-400" />
                    </button>
                    <button
                      onClick={() => remove.mutate(img.id)}
                      className="p-1.5 rounded hover:bg-slate-800"
                    >
                      <Trash2 className="w-4 h-4 text-rose-400" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center gap-3 px-4 py-2 border-t border-slate-800 bg-slate-900/40 text-xs text-slate-400">
          <div>
            {t("common.pagination.range", {
              from: rangeFrom,
              to: rangeTo,
              total: totalRows,
            })}
          </div>
          <div className="flex items-center gap-1">
            <span>{t("common.pagination.rowsPerPage")}</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5"
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("common.pagination.prev")}
            </button>
            <span className="px-1">
              {t("common.pagination.pageOf", { page: currentPage, total: pageCount })}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
              className="px-2 py-1 rounded border border-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {t("common.pagination.next")}
            </button>
          </div>
        </div>
      </div>

      {runTarget && (
        <RunImageModal
          image={runTarget}
          onClose={() => setRunTarget(null)}
          onCreated={(id) => {
            setRunTarget(null);
            qc.invalidateQueries({ queryKey: ["containers"] });
            router.push(`/containers/${id}`);
          }}
        />
      )}
    </div>
  );
}

function HubItem({
  item,
  onPull,
  pulling,
  pulledTags,
}: {
  item: HubResult;
  onPull: (image: string, tag: string) => void;
  pulling: boolean;
  pulledTags: Set<string>;
}) {
  const { t } = useT();
  const [tag, setTag] = useState("latest");

  const effectiveTag = tag || "latest";
  const alreadyPulled = pulledTags.has(`${item.name}:${effectiveTag}`);

  const hubUrl = item.name.includes("/")
    ? `https://hub.docker.com/r/${item.name}`
    : `https://hub.docker.com/_/${item.name}`;

  return (
    <li className="px-3 py-2 hover:bg-slate-900/40">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={hubUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sm text-brand-300 hover:underline"
            >
              {item.name}
            </a>
            {item.isOfficial && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-sky-500/20 text-sky-300">
                <BadgeCheck className="w-3 h-3" /> {t("images.hub.official")}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <Star className="w-3 h-3" />
              {item.starCount.toLocaleString()}
            </span>
            <a
              href={hubUrl}
              target="_blank"
              rel="noreferrer"
              className="text-slate-500 hover:text-slate-300"
              title={t("images.hub.openInHub")}
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
          {item.description && (
            <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">
              {item.description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <TagPicker name={item.name} value={tag} onChange={setTag} />
          <button
            disabled={pulling || alreadyPulled}
            onClick={() => onPull(item.name, effectiveTag)}
            title={alreadyPulled ? t("images.hub.alreadyPulled") : undefined}
            className="px-2.5 py-1 rounded-md bg-brand-600 hover:bg-brand-500 text-xs flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Download className="w-3.5 h-3.5" />{" "}
            {alreadyPulled ? t("images.hub.pulled") : t("images.hub.pull")}
          </button>
        </div>
      </div>
    </li>
  );
}

function TagPicker({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (tag: string) => void;
}) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const tagsQuery = useQuery({
    queryKey: ["hub-tags", name],
    queryFn: () =>
      api<{ tags: HubTag[] }>(`/images/hub/${encodeURIComponent(name)}/tags`),
    enabled: open,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", handler);
    return () => window.removeEventListener("mousedown", handler);
  }, [open]);

  const tags = tagsQuery.data?.tags ?? [];
  const trimmed = filter.trim().toLowerCase();
  const filtered = trimmed ? tags.filter((tg) => tg.name.toLowerCase().includes(trimmed)) : tags;
  const customValue = filter.trim();
  const hasCustom = customValue.length > 0 && !tags.some((tg) => tg.name === customValue);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-xs w-32 flex items-center justify-between gap-1 hover:border-slate-600"
      >
        <span className="truncate font-mono">{value || "latest"}</span>
        <ChevronDown className="w-3 h-3 text-slate-500 shrink-0" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 w-64 bg-slate-950 border border-slate-700 rounded-md shadow-xl">
          <div className="p-2 border-b border-slate-800">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("images.hub.tagSearchPlaceholder")}
              className="w-full bg-slate-900 border border-slate-800 rounded-md px-2 py-1 text-xs"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {tagsQuery.isLoading && (
              <div className="px-3 py-2 text-xs text-slate-500">
                {t("images.hub.loadingTags")}
              </div>
            )}
            {tagsQuery.error && (
              <div className="px-3 py-2 text-xs text-rose-300">
                {(tagsQuery.error as Error).message}
              </div>
            )}
            {!tagsQuery.isLoading && !tagsQuery.error && filtered.length === 0 && !hasCustom && (
              <div className="px-3 py-2 text-xs text-slate-500">{t("images.hub.tagsEmpty")}</div>
            )}
            {filtered.map((tg) => (
              <button
                key={tg.name}
                onClick={() => {
                  onChange(tg.name);
                  setOpen(false);
                  setFilter("");
                }}
                className={
                  "w-full text-left px-3 py-1.5 text-xs flex items-center justify-between gap-2 hover:bg-slate-800/60 " +
                  (value === tg.name ? "text-brand-200" : "text-slate-200")
                }
              >
                <span className="font-mono truncate">{tg.name}</span>
                {typeof tg.size === "number" && (
                  <span className="text-[10px] text-slate-500 shrink-0">
                    {humanBytes(tg.size)}
                  </span>
                )}
              </button>
            ))}
            {hasCustom && (
              <button
                onClick={() => {
                  onChange(customValue);
                  setOpen(false);
                  setFilter("");
                }}
                className="w-full text-left px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800/60 border-t border-slate-800"
              >
                {t("images.hub.useCustom", { value: customValue })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 uppercase text-xs tracking-wide text-slate-400 hover:text-slate-200"
    >
      <span>{label}</span>
      {active ? (
        dir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
      ) : (
        <ArrowDown className="w-3 h-3 opacity-20" />
      )}
    </button>
  );
}

function InUseBadge({ usage }: { usage?: { total: number; running: number } }) {
  const { t } = useT();
  if (!usage || usage.total === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-slate-800/60 text-slate-400">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        {t("images.inUse.unused")}
      </span>
    );
  }
  if (usage.running > 0) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-300"
        title={t("images.inUse.running", { running: usage.running, total: usage.total })}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        {t("images.inUse.running", { running: usage.running, total: usage.total })}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs bg-amber-500/20 text-amber-300"
      title={t("images.inUse.stopped", { total: usage.total })}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
      {t("images.inUse.stopped", { total: usage.total })}
    </span>
  );
}

function RunImageModal({
  image,
  onClose,
  onCreated,
}: {
  image: ImageSummary;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { t } = useT();
  const displayTag = image.repoTags[0] ?? image.id.replace("sha256:", "").slice(0, 12);
  const [name, setName] = useState("");
  const [ports, setPorts] = useState("");
  const [env, setEnv] = useState("");
  const [command, setCommand] = useState("");
  const [autoStart, setAutoStart] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setError(null);
    setBusy(true);
    try {
      const exposedPorts: Record<string, {}> = {};
      const portBindings: Record<string, Array<{ HostPort: string }>> = {};
      for (const line of ports.split(/\n+/).map((l) => l.trim()).filter(Boolean)) {
        const m = line.match(/^(\d+)\s*:\s*(\d+)(?:\/(tcp|udp))?$/i);
        if (!m) throw new Error(`Invalid port mapping: ${line}`);
        const host = m[1];
        const cont = m[2];
        const proto = (m[3] ?? "tcp").toLowerCase();
        const key = `${cont}/${proto}`;
        exposedPorts[key] = {};
        (portBindings[key] ??= []).push({ HostPort: host });
      }
      const envList = env
        .split(/\n+/)
        .map((l) => l.trim())
        .filter((l) => l && l.includes("="));

      const cmdParts = command.trim() ? command.trim().split(/\s+/) : undefined;

      const body: Record<string, any> = {
        Image: displayTag,
        Env: envList.length ? envList : undefined,
        Cmd: cmdParts,
        ExposedPorts: Object.keys(exposedPorts).length ? exposedPorts : undefined,
        HostConfig: Object.keys(portBindings).length ? { PortBindings: portBindings } : undefined,
      };
      if (name.trim()) body.name = name.trim();

      const created = await api<{ id: string }>("/containers", {
        method: "POST",
        body: JSON.stringify(body),
        headers: { "Content-Type": "application/json" },
      });
      if (autoStart) {
        await api(`/containers/${created.id}/start`, { method: "POST" });
      }
      onCreated(created.id);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div>
            <div className="text-sm font-medium text-slate-200">{t("images.runModal.title")}</div>
            <div className="text-xs text-slate-500 font-mono">{displayTag}</div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-200">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <label className="block">
            <span className="text-xs text-slate-400">{t("images.runModal.name")}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("images.runModal.namePlaceholder")}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">{t("images.runModal.ports")}</span>
            <textarea
              value={ports}
              onChange={(e) => setPorts(e.target.value)}
              rows={2}
              placeholder={t("images.runModal.portsPlaceholder")}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">{t("images.runModal.env")}</span>
            <textarea
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              rows={3}
              placeholder={t("images.runModal.envPlaceholder")}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs"
            />
          </label>
          <label className="block">
            <span className="text-xs text-slate-400">{t("images.runModal.command")}</span>
            <input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder={t("images.runModal.commandPlaceholder")}
              className="mt-1 w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono text-xs"
            />
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
            />
            {t("images.runModal.autoStart")}
          </label>
          {error && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded px-2 py-1">
              {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-sm"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Play className="w-3.5 h-3.5" />
            {t("images.runModal.run")}
          </button>
        </div>
      </div>
    </div>
  );
}

