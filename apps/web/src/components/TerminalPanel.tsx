"use client";
import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { wsUrl } from "@/lib/api";
import { useT } from "@/i18n/provider";
import { RotateCw } from "lucide-react";

export function TerminalPanel({
  containerId,
  running,
}: {
  containerId: string;
  running: boolean;
}) {
  const { t } = useT();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [shell, setShell] = useState("");
  const [status, setStatus] = useState<"idle" | "connecting" | "open" | "closed">("idle");
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!running || !containerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      fontFamily:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      fontSize: 13,
      theme: {
        background: "#020617",
        foreground: "#e2e8f0",
        cursor: "#38bdf8",
        black: "#0f172a",
        brightBlack: "#334155",
      },
      convertEol: true,
      scrollback: 2000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fit;

    requestAnimationFrame(() => {
      try {
        fit.fit();
      } catch {}
    });

    const params = new URLSearchParams();
    if (shell) params.set("shell", shell);
    params.set("cols", String(term.cols));
    params.set("rows", String(term.rows));
    setStatus("connecting");
    const ws = new WebSocket(
      wsUrl(`/ws/containers/${containerId}/exec?${params.toString()}`),
    );
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("open");
      term.focus();
    };
    ws.onmessage = (ev) => {
      if (typeof ev.data === "string") {
        term.write(ev.data);
      } else {
        term.write(new Uint8Array(ev.data as ArrayBuffer));
      }
    };
    ws.onclose = () => {
      setStatus("closed");
      term.write("\r\n\x1b[31m[connection closed]\x1b[0m\r\n");
    };
    ws.onerror = () => {
      setStatus("closed");
    };

    const dataDisp = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(new TextEncoder().encode(data));
      }
    });

    const resizeDisp = term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });

    const onWinResize = () => {
      try {
        fit.fit();
      } catch {}
    };
    window.addEventListener("resize", onWinResize);

    return () => {
      window.removeEventListener("resize", onWinResize);
      dataDisp.dispose();
      resizeDisp.dispose();
      try {
        ws.close();
      } catch {}
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerId, running, shell, nonce]);

  if (!running) {
    return (
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">
        {t("containers.detail.exec.notRunning")}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 overflow-hidden bg-[#020617]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-800 bg-slate-900/60 text-xs text-slate-400">
        <span>{t("containers.detail.exec.shell")}</span>
        <select
          value={shell}
          onChange={(e) => setShell(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5"
        >
          <option value="">{t("containers.detail.exec.autoShell")}</option>
          <option value="/bin/bash">bash</option>
          <option value="/bin/sh">sh</option>
          <option value="/bin/ash">ash</option>
          <option value="/usr/bin/zsh">zsh</option>
        </select>
        <span className="ml-2">
          {status === "connecting" && t("containers.detail.exec.connecting")}
          {status === "open" && (
            <span className="text-emerald-400">
              {t("containers.detail.exec.connected")}
            </span>
          )}
          {status === "closed" && (
            <span className="text-rose-400">
              {t("containers.detail.exec.disconnected")}
            </span>
          )}
        </span>
        <button
          onClick={() => setNonce((n) => n + 1)}
          className="ml-auto p-1 rounded hover:bg-slate-800"
          title={t("containers.detail.exec.reconnect")}
        >
          <RotateCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div ref={containerRef} className="h-[500px] px-2 py-1" />
    </div>
  );
}
