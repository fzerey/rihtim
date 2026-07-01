"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/provider";
import { Folder, File as FileIcon, ChevronLeft, RefreshCw, Link as LinkIcon } from "lucide-react";

interface Entry {
  name: string;
  isDir: boolean;
  isLink: boolean;
  size: number;
  mode: number;
  mtime: number;
  linkTarget?: string;
}

interface ListResponse {
  path: string;
  isDir: boolean;
  truncated: boolean;
  entries: Entry[];
}

interface FileResponse {
  path: string;
  size: number;
  truncated: boolean;
  binary: boolean;
  content: string;
  encoding: "utf-8" | "base64";
}

export function FileBrowser({ containerId }: { containerId: string }) {
  const { t } = useT();
  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [viewFile, setViewFile] = useState<{
    name: string;
    content: string;
    binary: boolean;
    truncated: boolean;
    size: number;
  } | null>(null);

  async function load(target: string) {
    setLoading(true);
    setError(null);
    setViewFile(null);
    try {
      const res = await api<ListResponse>(
        `/containers/${containerId}/fs?path=${encodeURIComponent(target)}`,
      );
      setEntries(res.entries);
      setTruncated(res.truncated);
      setPath(res.path);
    } catch (e: any) {
      setError(e.message ?? String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId]);

  function open(entry: Entry) {
    if (entry.isDir) {
      const next = joinPath(path, entry.name);
      load(next);
    } else {
      openFile(entry.name);
    }
  }

  async function openFile(name: string) {
    const full = joinPath(path, name);
    try {
      const res = await api<FileResponse>(
        `/containers/${containerId}/file?path=${encodeURIComponent(full)}`,
      );
      setViewFile({
        name: full,
        content: res.content,
        binary: res.binary,
        truncated: res.truncated,
        size: res.size,
      });
    } catch (e: any) {
      setViewFile({
        name: full,
        content: e.message ?? String(e),
        binary: false,
        truncated: false,
        size: 0,
      });
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-[400px]">
      <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden flex flex-col">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 text-xs">
          <button
            onClick={() => load("/")}
            className="p-1 rounded hover:bg-slate-800"
            title={t("containers.files.rootDir")}
          >
            /
          </button>
          <button
            onClick={() => load(parentPath(path))}
            className="p-1 rounded hover:bg-slate-800"
            title={t("containers.files.upDir")}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") load(path);
            }}
            className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-1 font-mono"
          />
          <button
            onClick={() => load(path)}
            className="p-1 rounded hover:bg-slate-800"
            title={t("common.refresh")}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto text-sm">
          {loading && <div className="p-4 text-slate-500">{t("common.loading")}</div>}
          {error && (
            <div className="p-4 text-rose-300 text-xs whitespace-pre-wrap">{error}</div>
          )}
          {!loading &&
            !error &&
            entries.map((e) => (
              <button
                key={e.name}
                onClick={() => open(e)}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-slate-800/60 text-left"
              >
                {e.isDir ? (
                  <Folder className="w-4 h-4 text-brand-300" />
                ) : e.isLink ? (
                  <LinkIcon className="w-4 h-4 text-amber-300" />
                ) : (
                  <FileIcon className="w-4 h-4 text-slate-400" />
                )}
                <span className="flex-1 truncate">
                  {e.name}
                  {e.isLink && e.linkTarget && (
                    <span className="text-slate-500"> → {e.linkTarget}</span>
                  )}
                </span>
                <span className="text-xs text-slate-500 font-mono">{formatMode(e.mode)}</span>
                {!e.isDir && (
                  <span className="text-xs text-slate-500 w-16 text-right">{e.size}</span>
                )}
              </button>
            ))}
          {truncated && (
            <div className="p-3 text-xs text-amber-300">…truncated</div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-800 bg-slate-950/40 overflow-hidden flex flex-col">
        <div className="px-3 py-2 border-b border-slate-800 text-xs font-mono truncate flex items-center gap-2">
          <span className="flex-1 truncate">
            {viewFile?.name ?? t("containers.files.empty")}
          </span>
          {viewFile && (
            <span className="text-slate-500">
              {viewFile.size}B
              {viewFile.binary ? " • binary" : ""}
              {viewFile.truncated ? " • truncated" : ""}
            </span>
          )}
        </div>
        <pre className="flex-1 overflow-auto p-3 text-xs whitespace-pre-wrap font-mono">
          {viewFile?.binary
            ? "[binary content omitted]"
            : (viewFile?.content ?? "")}
        </pre>
      </div>
    </div>
  );
}

function joinPath(base: string, name: string): string {
  if (base.endsWith("/")) return `${base}${name}`;
  return `${base}/${name}`;
}

function parentPath(p: string): string {
  const stripped = p.replace(/\/+$/, "");
  const idx = stripped.lastIndexOf("/");
  if (idx <= 0) return "/";
  return stripped.slice(0, idx);
}

function formatMode(mode: number): string {
  if (!mode) return "";
  const perm = mode & 0o777;
  const chars = [
    perm & 0o400 ? "r" : "-",
    perm & 0o200 ? "w" : "-",
    perm & 0o100 ? "x" : "-",
    perm & 0o040 ? "r" : "-",
    perm & 0o020 ? "w" : "-",
    perm & 0o010 ? "x" : "-",
    perm & 0o004 ? "r" : "-",
    perm & 0o002 ? "w" : "-",
    perm & 0o001 ? "x" : "-",
  ];
  return chars.join("");
}
