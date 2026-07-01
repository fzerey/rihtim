"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { DockerContext } from "@rihtim/shared";
import { Check, ChevronDown, Moon, Sun, Monitor } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useT } from "@/i18n/provider";
import { LocaleSwitcher } from "./LocaleSwitcher";
import { useTheme, type ThemeMode } from "./ThemeProvider";

export function Topbar() {
  const qc = useQueryClient();
  const { t } = useT();
  const { data: contexts } = useQuery({
    queryKey: ["contexts"],
    queryFn: () => api<DockerContext[]>("/contexts"),
    refetchInterval: false,
  });

  const { data: info } = useQuery({
    queryKey: ["system", "info"],
    queryFn: () => api<any>("/system/info"),
    refetchInterval: 8000,
  });

  const select = useMutation({
    mutationFn: (id: string) => api(`/contexts/${id}/select`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries();
    },
  });

  const current = contexts?.find((c) => c.current);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <header className="h-14 border-b border-slate-800 bg-slate-950/60 flex items-center px-4 gap-3">
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/70 hover:bg-slate-700/70 text-sm"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>{current?.name ?? t("topbar.noContext")}</span>
          <ChevronDown className="w-4 h-4 opacity-70" />
        </button>
        {open && (
          <div className="absolute mt-1 z-20 w-64 rounded-md border border-slate-700 bg-slate-900 shadow-xl">
            {contexts?.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  select.mutate(c.id);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-800 flex items-center justify-between"
              >
                <span>
                  <span className="block">{c.name}</span>
                  <span className="block text-xs text-slate-500 uppercase">{c.kind}</span>
                </span>
                {c.current && <Check className="w-4 h-4 text-emerald-400" />}
              </button>
            ))}
            <Link
              href="/settings"
              className="block px-3 py-2 text-sm border-t border-slate-800 text-brand-300 hover:bg-slate-800"
            >
              {t("topbar.manageContexts")}
            </Link>
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-4">
        <div className="text-xs text-slate-400 flex items-center gap-4">
          {info?.serverVersion && (
            <span>
              {t("topbar.docker")} <span className="text-slate-200">{info.serverVersion}</span>
            </span>
          )}
          {info?.operatingSystem && <span>{info.operatingSystem}</span>}
        </div>
        <ThemeSwitcher />
        <LocaleSwitcher />
      </div>
    </header>
  );
}

function ThemeSwitcher() {
  const { t } = useT();
  const { mode, setMode } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const items: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: "light", label: t("topbar.theme.light"), icon: Sun },
    { value: "dark", label: t("topbar.theme.dark"), icon: Moon },
    { value: "system", label: t("topbar.theme.system"), icon: Monitor },
  ];
  const active = items.find((i) => i.value === mode) ?? items[1];
  const ActiveIcon = active.icon;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-800/70 hover:bg-slate-700/70 text-xs"
        aria-label={t("topbar.theme.label")}
        title={t("topbar.theme.label")}
      >
        <ActiveIcon className="w-3.5 h-3.5" />
        <span>{active.label}</span>
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-20 w-40 rounded-md border border-slate-700 bg-slate-900 shadow-xl">
          {items.map((i) => {
            const Icon = i.icon;
            return (
              <button
                key={i.value}
                onClick={() => {
                  setMode(i.value);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-800 flex items-center gap-2"
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="flex-1">{i.label}</span>
                {mode === i.value && <Check className="w-3.5 h-3.5 text-emerald-400" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
