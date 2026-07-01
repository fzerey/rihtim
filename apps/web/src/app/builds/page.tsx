"use client";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, humanBytes, timeAgo } from "@/lib/api";
import type { BuildCacheEntry } from "@rihtim/shared";
import { Hammer, Trash2, Play, X, Loader2, Package } from "lucide-react";
import { useT } from "@/i18n/provider";

export default function BuildsPage() {
  const { t, locale } = useT();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["build-cache"],
    queryFn: () => api<BuildCacheEntry[]>("/build/cache"),
    refetchInterval: 10_000,
  });

  const prune = useMutation({
    mutationFn: (all: boolean) =>
      api<{ spaceReclaimed: number; cachesDeleted: string[] }>(
        `/build/prune?all=${all ? "true" : "false"}`,
        { method: "POST" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["build-cache"] }),
  });

  const [showBuild, setShowBuild] = useState(false);

  const entries = data ?? [];
  const totalSize = entries.reduce((a, b) => a + b.size, 0);
  const reclaimable = entries.filter((b) => !b.inUse).reduce((a, b) => a + b.size, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Hammer className="w-5 h-5 text-brand-400" />
          {t("builds.title")}
        </h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowBuild(true)}
            className="px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-500 text-sm flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5" />
            {t("builds.newBuild")}
          </button>
          <button
            onClick={() => prune.mutate(false)}
            disabled={prune.isPending}
            className="px-3 py-1.5 rounded-md border border-slate-700 hover:bg-slate-800 text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("builds.prune")}
          </button>
          <button
            onClick={() => {
              if (confirm(t("builds.pruneAllConfirm"))) prune.mutate(true);
            }}
            disabled={prune.isPending}
            className="px-3 py-1.5 rounded-md border border-rose-800/60 text-rose-300 hover:bg-rose-950/40 text-sm flex items-center gap-1.5 disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t("builds.pruneAll")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label={t("builds.summary.entries")} value={entries.length.toString()} />
        <SummaryCard label={t("builds.summary.total")} value={humanBytes(totalSize)} />
        <SummaryCard label={t("builds.summary.reclaimable")} value={humanBytes(reclaimable)} />
      </div>

      <div className="rounded-xl border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/70 text-slate-400">
            <tr className="text-left">
              <th className="px-4 py-2">{t("builds.columns.id")}</th>
              <th className="px-4 py-2">{t("builds.columns.type")}</th>
              <th className="px-4 py-2">{t("builds.columns.description")}</th>
              <th className="px-4 py-2">{t("builds.columns.size")}</th>
              <th className="px-4 py-2">{t("builds.columns.usage")}</th>
              <th className="px-4 py-2">{t("builds.columns.lastUsed")}</th>
              <th className="px-4 py-2">{t("builds.columns.status")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 bg-slate-950/40">
            {entries.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {t("builds.empty")}
                </td>
              </tr>
            )}
            {entries.map((b) => (
              <tr key={b.id} className="hover:bg-slate-900/40">
                <td className="px-4 py-2 font-mono text-xs text-slate-400">
                  {b.id.slice(0, 12)}
                </td>
                <td className="px-4 py-2 text-xs">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    {b.type || "—"}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-300 max-w-[420px] truncate">
                  {b.description || "—"}
                </td>
                <td className="px-4 py-2">{humanBytes(b.size)}</td>
                <td className="px-4 py-2 text-slate-400">{b.usageCount}</td>
                <td className="px-4 py-2 text-slate-400">
                  {b.lastUsedAt
                    ? t("containers.ago", { value: timeAgo(b.lastUsedAt, locale) })
                    : "—"}
                </td>
                <td className="px-4 py-2">
                  {b.inUse ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-emerald-500/20 text-emerald-300">
                      {t("builds.status.inUse")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400">
                      {t("builds.status.idle")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showBuild && <BuildModal onClose={() => setShowBuild(false)} />}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}

function BuildModal({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient();
  const [contextPath, setContextPath] = useState("");
  const [dockerfile, setDockerfile] = useState("Dockerfile");
  const [tag, setTag] = useState("");
  const [noCache, setNoCache] = useState(false);
  const [pull, setPull] = useState(false);
  const [buildArgsText, setBuildArgsText] = useState("");
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const outputRef = useRef<HTMLPreElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  function parseBuildArgs(): Record<string, string> {
    const args: Record<string, string> = {};
    for (const raw of buildArgsText.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      const v = line.slice(eq + 1).trim();
      if (k) args[k] = v;
    }
    return args;
  }

  async function runBuild() {
    setError(null);
    setOutput("");
    setDone(false);
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: ctrl.signal,
        body: JSON.stringify({
          contextPath,
          dockerfile,
          tag,
          noCache,
          pull,
          buildArgs: parseBuildArgs(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        try {
          const j = JSON.parse(text);
          throw new Error(j.message || j.error || text);
        } catch {
          throw new Error(text || res.statusText);
        }
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx = buffer.indexOf("\n");
        while (idx !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (line) {
            try {
              const msg = JSON.parse(line);
              if (msg.stream) setOutput((s) => s + msg.stream);
              else if (msg.error) {
                setError(msg.error);
                setOutput((s) => s + `\nERROR: ${msg.error}\n`);
              } else if (msg.status) {
                setOutput((s) => s + msg.status + (msg.progress ? " " + msg.progress : "") + "\n");
              } else if (msg.aux) {
                if (msg.aux.ID) setOutput((s) => s + `Image ID: ${msg.aux.ID}\n`);
              }
            } catch {
              setOutput((s) => s + line + "\n");
            }
          }
          idx = buffer.indexOf("\n");
        }
      }
      setDone(true);
      qc.invalidateQueries({ queryKey: ["images"] });
      qc.invalidateQueries({ queryKey: ["build-cache"] });
    } catch (err: any) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  const canRun = contextPath.trim().length > 0 && tag.trim().length > 0 && !running;

  return (
    <div className="fixed inset-0 z-30 bg-slate-950/70 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Package className="w-4 h-4 text-brand-400" />
            <span className="font-semibold">{t("builds.modal.title")}</span>
          </div>
          <button
            onClick={() => {
              abortRef.current?.abort();
              onClose();
            }}
            className="p-1 rounded hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {t("builds.modal.contextPath")}
            </label>
            <input
              value={contextPath}
              onChange={(e) => setContextPath(e.target.value)}
              placeholder={t("builds.modal.contextPathPlaceholder")}
              disabled={running}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-sm font-mono disabled:opacity-60"
            />
            <div className="text-[10px] text-slate-500 mt-1">
              {t("builds.modal.contextPathHint")}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t("builds.modal.dockerfile")}
              </label>
              <input
                value={dockerfile}
                onChange={(e) => setDockerfile(e.target.value)}
                disabled={running}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-sm font-mono disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {t("builds.modal.tag")}
              </label>
              <input
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="myapp:latest"
                disabled={running}
                className="w-full bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-sm font-mono disabled:opacity-60"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              {t("builds.modal.buildArgs")}
            </label>
            <textarea
              value={buildArgsText}
              onChange={(e) => setBuildArgsText(e.target.value)}
              placeholder="KEY=VALUE"
              disabled={running}
              rows={3}
              className="w-full bg-slate-950 border border-slate-800 rounded-md px-2 py-1.5 text-sm font-mono disabled:opacity-60"
            />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={noCache}
                onChange={(e) => setNoCache(e.target.checked)}
                disabled={running}
              />
              {t("builds.modal.noCache")}
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={pull}
                onChange={(e) => setPull(e.target.checked)}
                disabled={running}
              />
              {t("builds.modal.pull")}
            </label>
          </div>

          {(output || error) && (
            <div className="rounded-md border border-slate-800 bg-slate-950 overflow-hidden">
              <div className="px-3 py-1.5 text-xs text-slate-400 border-b border-slate-800 flex items-center justify-between">
                <span>{t("builds.modal.output")}</span>
                {running && (
                  <span className="flex items-center gap-1 text-brand-300">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {t("builds.modal.building")}
                  </span>
                )}
                {done && !error && (
                  <span className="text-emerald-300">{t("builds.modal.done")}</span>
                )}
              </div>
              <pre
                ref={outputRef}
                className="p-3 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto text-slate-300"
              >
                {output}
              </pre>
            </div>
          )}
          {error && (
            <div className="text-xs text-rose-300 border border-rose-900/50 bg-rose-950/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-slate-800">
          {running ? (
            <button
              onClick={() => abortRef.current?.abort()}
              className="px-3 py-1.5 rounded-md border border-slate-700 hover:bg-slate-800 text-sm"
            >
              {t("common.cancel")}
            </button>
          ) : (
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md border border-slate-700 hover:bg-slate-800 text-sm"
            >
              {t("common.close")}
            </button>
          )}
          <button
            onClick={runBuild}
            disabled={!canRun}
            className="px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-500 text-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
            {t("builds.modal.build")}
          </button>
        </div>
      </div>
    </div>
  );
}
