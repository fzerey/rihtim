"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useT } from "@/i18n/provider";
import {
  Folder,
  File as FileIcon,
  ChevronLeft,
  RefreshCw,
  Link as LinkIcon,
  Pencil,
  Save,
  X,
} from "lucide-react";
import type { FileEntry, FileListResponse, FileResponse } from "@/types/files";

export function FileBrowser({
  apiBase,
  editable = false,
}: {
  apiBase: string;
  editable?: boolean;
}) {
  const { t } = useT();
  const [path, setPath] = useState("/");
  const [entries, setEntries] = useState<FileEntry[]>([]);
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

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  async function load(target: string) {
    setLoading(true);
    setError(null);
    setViewFile(null);
    setEditing(false);
    try {
      const res = await api<FileListResponse>(
        `${apiBase}/fs?path=${encodeURIComponent(target)}`,
      );
      setEntries(res.entries);
      setTruncated(res.truncated);
      setPath(res.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase]);

  function open(entry: FileEntry) {
    if (entry.isDir) {
      const next = joinPath(path, entry.name);
      load(next);
    } else {
      openFile(entry.name);
    }
  }

  async function openFile(name: string) {
    const full = joinPath(path, name);
    setEditing(false);
    setSaveError(null);
    setSavedAt(null);
    try {
      const res = await api<FileResponse>(
        `${apiBase}/file?path=${encodeURIComponent(full)}`,
      );
      setViewFile({
        name: full,
        content: res.content,
        binary: res.binary,
        truncated: res.truncated,
        size: res.size,
      });
    } catch (e) {
      setViewFile({
        name: full,
        content: e instanceof Error ? e.message : String(e),
        binary: false,
        truncated: false,
        size: 0,
      });
    }
  }

  function startEdit() {
    if (!viewFile) return;
    setDraft(viewFile.content);
    setSaveError(null);
    setSavedAt(null);
    setEditing(true);
  }

  async function saveEdit() {
    if (!viewFile) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api(`${apiBase}/file`, {
        method: "PUT",
        json: { path: viewFile.name, content: draft, encoding: "utf-8" },
      });
      setViewFile({ ...viewFile, content: draft, size: new Blob([draft]).size });
      setEditing(false);
      setSavedAt(Date.now());
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const canEdit = editable && viewFile && !viewFile.binary && !viewFile.truncated;

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
            <span className="text-slate-500 shrink-0">
              {viewFile.size}B
              {viewFile.binary ? " • binary" : ""}
              {viewFile.truncated ? " • truncated" : ""}
            </span>
          )}
          {canEdit && !editing && (
            <button
              onClick={startEdit}
              className="p-1 rounded hover:bg-slate-800 text-brand-300 shrink-0"
              title={t("files.edit")}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {editing && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={saveEdit}
                disabled={saving}
                className="p-1 rounded hover:bg-slate-800 text-emerald-400 disabled:opacity-50"
                title={t("files.save")}
              >
                <Save className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  setEditing(false);
                  setSaveError(null);
                }}
                className="p-1 rounded hover:bg-slate-800 text-slate-400"
                title={t("common.cancel")}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        {saveError && (
          <div className="px-3 py-1.5 text-xs text-rose-300 bg-rose-500/10 border-b border-rose-500/30">
            {saveError}
          </div>
        )}
        {savedAt && !editing && (
          <div className="px-3 py-1.5 text-xs text-emerald-300 bg-emerald-500/10 border-b border-emerald-500/30">
            {t("files.saved")}
          </div>
        )}
        {editing ? (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            className="flex-1 w-full resize-none bg-slate-950 p-3 text-xs font-mono outline-none"
          />
        ) : (
          <pre className="flex-1 overflow-auto p-3 text-xs whitespace-pre-wrap font-mono">
            {viewFile?.binary
              ? "[binary content omitted]"
              : (viewFile?.content ?? "")}
          </pre>
        )}
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
