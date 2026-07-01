"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ConnectionKind, DockerContext, ContextTestResult } from "@rihtim/shared";
import { Trash2, CheckCircle2, XCircle, Plus, PlugZap } from "lucide-react";
import { useT } from "@/i18n/provider";

const KINDS: ConnectionKind[] = ["npipe", "socket", "tcp", "ssh", "wsl"];

export default function SettingsPage() {
  const qc = useQueryClient();
  const { t } = useT();
  const { data } = useQuery({
    queryKey: ["contexts"],
    queryFn: () => api<DockerContext[]>("/contexts"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/contexts/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contexts"] }),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">{t("settings.title")}</h1>
        <p className="text-sm text-slate-400">{t("settings.subtitle")}</p>
      </div>

      <div className="space-y-2">
        {data?.map((c) => (
          <ContextRow key={c.id} ctx={c} onRemove={() => remove.mutate(c.id)} />
        ))}
      </div>

      <NewContextForm />

      <div className="rounded-xl border border-amber-800/50 bg-amber-900/10 p-4 text-sm text-amber-200/90">
        <div className="font-medium mb-1">{t("settings.wslHint.title")}</div>
        <ul className="list-disc pl-5 space-y-1">
          <li>{t("settings.wslHint.line1")}</li>
          <li>{t("settings.wslHint.line2")}</li>
          <li>{t("settings.wslHint.line3")}</li>
          <li>{t("settings.wslHint.line4")}</li>
        </ul>
      </div>
    </div>
  );
}

function ContextRow({ ctx, onRemove }: { ctx: DockerContext; onRemove: () => void }) {
  const qc = useQueryClient();
  const { t } = useT();
  const test = useMutation({
    mutationFn: () => api<ContextTestResult>(`/contexts/${ctx.id}/test`, { method: "POST" }),
  });
  const select = useMutation({
    mutationFn: () => api(`/contexts/${ctx.id}/select`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 flex items-start gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-medium">{ctx.name}</div>
          {ctx.current && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
              {t("settings.active")}
            </span>
          )}
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
            {t(`settings.kinds.${ctx.kind}`)}
          </span>
        </div>
        <div className="text-xs text-slate-500 font-mono mt-1 truncate">
          {ctx.kind === "npipe" || ctx.kind === "socket"
            ? ctx.socketPath
            : ctx.kind === "tcp"
              ? `${ctx.host}:${ctx.port ?? 2375}`
              : ctx.kind === "ssh"
                ? ctx.sshHost
                : ctx.wslDistro}
        </div>
        {test.data && (
          <div className="mt-2 text-xs flex items-center gap-1">
            {test.data.ok ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>
                  {t("settings.versionInfo", {
                    version: test.data.version?.version ?? "",
                    api: test.data.version?.apiVersion ?? "",
                    os: test.data.version?.os ?? "",
                    arch: test.data.version?.arch ?? "",
                  })}
                </span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-rose-400" />
                <span className="text-rose-300">{test.data.error}</span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => test.mutate()}
          className="px-2 py-1 rounded-md text-xs bg-slate-800 hover:bg-slate-700 flex items-center gap-1"
        >
          <PlugZap className="w-3.5 h-3.5" /> {t("settings.test")}
        </button>
        {!ctx.current && (
          <button
            onClick={() => select.mutate()}
            className="px-2 py-1 rounded-md text-xs bg-brand-600 hover:bg-brand-500"
          >
            {t("settings.makeActive")}
          </button>
        )}
        <button
          onClick={onRemove}
          className="p-1.5 rounded-md hover:bg-slate-800"
          title={t("common.remove")}
        >
          <Trash2 className="w-4 h-4 text-rose-400" />
        </button>
      </div>
    </div>
  );
}

function NewContextForm() {
  const qc = useQueryClient();
  const { t } = useT();
  const [kind, setKind] = useState<ConnectionKind>("wsl");
  const [name, setName] = useState("");
  const [socketPath, setSocketPath] = useState("//./pipe/docker_engine");
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(2375);
  const [sshHost, setSshHost] = useState("");
  const [wslDistro, setWslDistro] = useState("Ubuntu");

  const create = useMutation({
    mutationFn: () => {
      const body: any = { name: name || `${kind}-ctx`, kind };
      if (kind === "npipe" || kind === "socket") body.socketPath = socketPath;
      if (kind === "tcp") {
        body.host = host;
        body.port = port;
      }
      if (kind === "ssh") body.sshHost = sshHost;
      if (kind === "wsl") body.wslDistro = wslDistro;
      return api("/contexts", { method: "POST", json: body });
    },
    onSuccess: () => {
      setName("");
      qc.invalidateQueries({ queryKey: ["contexts"] });
    },
  });

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 space-y-3">
      <div className="font-medium flex items-center gap-2">
        <Plus className="w-4 h-4" /> {t("settings.newContext")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("settings.fields.name")}>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("settings.placeholders.name")}
          />
        </Field>
        <Field label={t("settings.fields.kind")}>
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as ConnectionKind)}
          >
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {t(`settings.kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>

        {(kind === "npipe" || kind === "socket") && (
          <Field label={t("settings.fields.socketPath")} full>
            <input
              className="input"
              value={socketPath}
              onChange={(e) => setSocketPath(e.target.value)}
              placeholder={
                kind === "npipe"
                  ? t("settings.placeholders.socketNpipe")
                  : t("settings.placeholders.socketUnix")
              }
            />
          </Field>
        )}

        {kind === "tcp" && (
          <>
            <Field label={t("settings.fields.host")}>
              <input className="input" value={host} onChange={(e) => setHost(e.target.value)} />
            </Field>
            <Field label={t("settings.fields.port")}>
              <input
                type="number"
                className="input"
                value={port}
                onChange={(e) => setPort(Number(e.target.value))}
              />
            </Field>
          </>
        )}

        {kind === "ssh" && (
          <Field label={t("settings.fields.sshHost")} full>
            <input
              className="input"
              value={sshHost}
              onChange={(e) => setSshHost(e.target.value)}
              placeholder={t("settings.placeholders.sshHost")}
            />
          </Field>
        )}

        {kind === "wsl" && (
          <Field label={t("settings.fields.wslDistro")} full>
            <input
              className="input"
              value={wslDistro}
              onChange={(e) => setWslDistro(e.target.value)}
              placeholder={t("settings.placeholders.wslDistro")}
            />
          </Field>
        )}
      </div>
      <button
        onClick={() => create.mutate()}
        className="px-3 py-1.5 rounded-md bg-brand-600 hover:bg-brand-500 text-sm"
      >
        {t("common.add")}
      </button>
      <style jsx>{`
        .input {
          width: 100%;
          background: #020617;
          border: 1px solid #1f2937;
          border-radius: 6px;
          padding: 6px 10px;
          font-size: 13px;
          color: inherit;
        }
      `}</style>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <label className={full ? "col-span-2 block" : "block"}>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      {children}
    </label>
  );
}
