"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Play, RotateCw, Square, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { QueryErrorBanner } from "@/components/QueryErrorBanner";
import { useT } from "@/i18n/provider";

type ComposeContainer = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  service?: string;
};

type ComposeProject = {
  name: string;
  total: number;
  running: number;
  services: string[];
  containers: ComposeContainer[];
};

export default function ComposePage() {
  const { t } = useT();
  const qc = useQueryClient();
  const [filePath, setFilePath] = useState("");
  const [projectName, setProjectName] = useState("");
  const [cliOutput, setCliOutput] = useState("");
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [pickedFileName, setPickedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const inferredProjectName =
    projectName ||
    (pickedFileName
      ? pickedFileName
          .replace(/\.(ya?ml)$/i, "")
          .replace(/[^a-zA-Z0-9_.-]/g, "-")
          .toLowerCase()
      : undefined);

  const browseComposeFile = async (): Promise<void> => {
    const desktopPicker = window.rihtim?.selectComposeFile;
    if (desktopPicker) {
      const picked = await desktopPicker();
      if (picked) {
        setFilePath(picked);
        setFileContent(null);
        setPickedFileName(null);
      }
      return;
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    fileInputRef.current?.click();
  };

  const { data, isLoading, error, isFetching, refetch } = useQuery({
    queryKey: ["compose-projects"],
    queryFn: () => api<ComposeProject[]>("/compose/projects"),
  });

  const action = useMutation({
    mutationFn: async ({ name, verb }: { name: string; verb: "start" | "stop" | "restart" }) =>
      api(`/compose/projects/${encodeURIComponent(name)}/${verb}`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compose-projects"] }),
  });

  const remove = useMutation({
    mutationFn: async (name: string) =>
      api(`/compose/projects/${encodeURIComponent(name)}?volumes=false`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compose-projects"] }),
  });

  const cliUp = useMutation({
    mutationFn: () =>
      api<{ command: string; stdout: string; stderr: string }>("/compose/cli/up", {
        method: "POST",
        json: {
          filePath: fileContent ? undefined : filePath,
          composeContent: fileContent ?? undefined,
          fileName: pickedFileName ?? undefined,
          projectName: inferredProjectName,
          detach: true,
        },
      }),
    onSuccess: (res) => {
      setCliOutput(
        [`$ ${res.command}`, res.stdout?.trim(), res.stderr?.trim()].filter(Boolean).join("\n\n"),
      );
      qc.invalidateQueries({ queryKey: ["compose-projects"] });
    },
    onError: (err) => {
      setCliOutput(String(err));
    },
  });

  const cliDown = useMutation({
    mutationFn: () =>
      api<{ command: string; stdout: string; stderr: string }>("/compose/cli/down", {
        method: "POST",
        json: {
          filePath: fileContent ? undefined : filePath,
          composeContent: fileContent ?? undefined,
          fileName: pickedFileName ?? undefined,
          projectName: inferredProjectName,
          volumes: false,
          removeOrphans: true,
        },
      }),
    onSuccess: (res) => {
      setCliOutput(
        [`$ ${res.command}`, res.stdout?.trim(), res.stderr?.trim()].filter(Boolean).join("\n\n"),
      );
      qc.invalidateQueries({ queryKey: ["compose-projects"] });
    },
    onError: (err) => {
      setCliOutput(String(err));
    },
  });

  return (
    <div className="space-y-4">
      <QueryErrorBanner error={error} isFetching={isFetching} onRetry={() => refetch()} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("compose.title")}</h1>
          <p className="text-sm text-slate-400">{t("compose.subtitle")}</p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded-md text-sm bg-slate-800 hover:bg-slate-700"
        >
          {t("common.refresh")}
        </button>
      </div>

      {isLoading && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-slate-500 text-sm">
          {t("common.loading")}
        </div>
      )}

      <section className="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
        <h2 className="font-medium">{t("compose.fileRunner.title")}</h2>
        <p className="text-xs text-slate-500">{t("compose.fileRunner.subtitle")}</p>
        <div className="grid gap-2 md:grid-cols-2">
          <div className="flex gap-2">
            <input
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm"
              placeholder={t("compose.fileRunner.filePathPlaceholder")}
            />
            <button
              onClick={() => void browseComposeFile()}
              className="px-3 py-1.5 rounded-md text-sm bg-slate-800 hover:bg-slate-700"
            >
              {t("compose.fileRunner.browse")}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".yml,.yaml"
              className="hidden"
              onChange={async (e) => {
                const picked = e.target.files?.[0];
                if (!picked) return;
                const text = await picked.text();
                setFileContent(text);
                setPickedFileName(picked.name);
                setFilePath(picked.name);
              }}
            />
          </div>
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-2 py-1.5 text-sm"
            placeholder={t("compose.fileRunner.projectNamePlaceholder")}
          />
        </div>
        <div className="flex gap-2">
          <button
            disabled={!filePath || cliUp.isPending}
            onClick={() => cliUp.mutate()}
            className="px-3 py-1.5 rounded-md text-sm bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50"
          >
            {t("compose.fileRunner.up")}
          </button>
          <button
            disabled={!filePath || cliDown.isPending}
            onClick={() => cliDown.mutate()}
            className="px-3 py-1.5 rounded-md text-sm bg-slate-800 hover:bg-slate-700 disabled:opacity-50"
          >
            {t("compose.fileRunner.down")}
          </button>
        </div>
        {cliOutput && (
          <pre className="text-xs bg-black/40 border border-slate-800 rounded p-3 overflow-auto whitespace-pre-wrap">
            {cliOutput}
          </pre>
        )}
      </section>

      <div className="space-y-3">
        {(data ?? []).map((p) => {
          const anyRunning = p.running > 0;
          const anyStopped = p.running < p.total;
          return (
            <section key={p.name} className="rounded-xl border border-slate-800 bg-slate-950/40">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div>
                  <h2 className="font-medium">{p.name}</h2>
                  <p className="text-xs text-slate-500">
                    {t("compose.summary", { running: p.running, total: p.total })}
                    {p.services.length > 0 ? ` • ${p.services.join(", ")}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {anyStopped && (
                    <IconBtn
                      title={t("compose.actions.start")}
                      onClick={() => action.mutate({ name: p.name, verb: "start" })}
                    >
                      <Play className="w-4 h-4" />
                    </IconBtn>
                  )}
                  {anyRunning && (
                    <IconBtn
                      title={t("compose.actions.stop")}
                      onClick={() => action.mutate({ name: p.name, verb: "stop" })}
                    >
                      <Square className="w-4 h-4" />
                    </IconBtn>
                  )}
                  <IconBtn
                    title={t("compose.actions.restart")}
                    onClick={() => action.mutate({ name: p.name, verb: "restart" })}
                  >
                    <RotateCw className="w-4 h-4" />
                  </IconBtn>
                  <IconBtn title={t("compose.actions.down")} onClick={() => remove.mutate(p.name)}>
                    <Trash2 className="w-4 h-4 text-rose-400" />
                  </IconBtn>
                </div>
              </div>

              <div className="divide-y divide-slate-800/80">
                {p.containers.map((c) => (
                  <div key={c.id} className="px-4 py-2.5 text-sm flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="text-xs text-slate-500 truncate">
                        {c.service ? `${c.service} • ` : ""}
                        {c.image}
                      </p>
                    </div>
                    <span className="text-xs text-slate-400">{c.status || c.state}</span>
                  </div>
                ))}
                {p.containers.length === 0 && (
                  <div className="px-4 py-4 text-sm text-slate-500">{t("compose.emptyProject")}</div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {!isLoading && (data?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-6 text-slate-500 text-sm">
          {t("compose.empty")}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800"
    >
      {children}
    </button>
  );
}
