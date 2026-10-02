"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Box, CornerDownLeft, Layers, Play, Search, Square, type LucideIcon } from "lucide-react";
import clsx from "clsx";
import type { ContainerSummary, ImageSummary } from "@rihtim/shared";
import { api } from "@/lib/api";
import { useT } from "@/i18n/provider";
import { navSections } from "./Sidebar";

export const OPEN_PALETTE_EVENT = "rihtim:open-palette";

type Item = {
  id: string;
  group: "pages" | "containers" | "images" | "actions";
  label: string;
  hint?: string;
  icon: LucideIcon;
  run: () => void;
};

const MAX_PER_GROUP = 6;

export function CommandPalette() {
  const { t } = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const previous = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => inputRef.current?.focus());
    return () => previous?.focus?.();
  }, [open]);

  const containers = useQuery({
    queryKey: ["containers"],
    queryFn: () => api<ContainerSummary[]>("/containers?all=true"),
    enabled: open,
    staleTime: 15_000,
  });
  const images = useQuery({
    queryKey: ["images"],
    queryFn: () => api<ImageSummary[]>("/images"),
    enabled: open,
    staleTime: 60_000,
  });

  const action = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: "start" | "stop" }) =>
      api(`/containers/${id}/${verb}`, { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["containers"] }),
  });

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (...fields: (string | undefined)[]) =>
      !q || fields.some((f) => f?.toLowerCase().includes(q));
    const go = (href: string) => () => {
      setOpen(false);
      router.push(href);
    };

    const pages: Item[] = navSections
      .flatMap((s) => s.items)
      .filter((p) => matches(t(p.key), p.href))
      .map((p) => ({ id: `page:${p.href}`, group: "pages", label: t(p.key), icon: p.icon, run: go(p.href) }));

    const containerList = containers.data ?? [];
    const containerName = (c: ContainerSummary) => c.names[0]?.replace(/^\//, "") ?? c.id.slice(0, 12);
    const matchedContainers = containerList.filter((c) => matches(containerName(c), c.image, c.id));

    const containerItems: Item[] = matchedContainers.slice(0, MAX_PER_GROUP).map((c) => ({
      id: `container:${c.id}`,
      group: "containers",
      label: containerName(c),
      hint: c.image,
      icon: Box,
      run: go(`/containers/${c.id}`),
    }));

    const actionItems: Item[] = q
      ? matchedContainers.slice(0, MAX_PER_GROUP).map((c) => {
          const running = c.state === "running";
          const verb = running ? "stop" : "start";
          return {
            id: `action:${verb}:${c.id}`,
            group: "actions",
            label: t(`palette.${verb}`, { name: containerName(c) }),
            icon: running ? Square : Play,
            run: () => {
              setOpen(false);
              action.mutate({ id: c.id, verb });
            },
          };
        })
      : [];

    const imageItems: Item[] = (images.data ?? [])
      .filter((img) => matches(...img.repoTags, img.id))
      .slice(0, MAX_PER_GROUP)
      .map((img) => ({
        id: `image:${img.id}`,
        group: "images",
        label: img.repoTags[0] && img.repoTags[0] !== "<none>:<none>" ? img.repoTags[0] : img.id.replace("sha256:", "").slice(0, 12),
        icon: Layers,
        run: go(`/images/${encodeURIComponent(img.id)}`),
      }));

    return [...pages, ...containerItems, ...actionItems, ...imageItems];
  }, [query, containers.data, images.data, t, router, action]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open || typeof document === "undefined") return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (items.length ? (i + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[active]?.run();
    }
  };

  const groups = (["pages", "containers", "actions", "images"] as const)
    .map((g) => ({ g, rows: items.map((item, index) => ({ item, index })).filter((r) => r.item.group === g) }))
    .filter((x) => x.rows.length > 0);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[14vh]">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("palette.title")}
        className="relative w-full max-w-xl card shadow-2xl shadow-black/30 overflow-hidden"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 px-4 border-b border-slate-800">
          <Search className="w-4 h-4 text-slate-500 shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("palette.placeholder")}
            aria-label={t("palette.placeholder")}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `palette-item-${active}` : undefined}
            className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-slate-500"
          />
          <span className="kbd">Esc</span>
        </div>
        <div ref={listRef} id="palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {groups.length === 0 && (
            <div className="px-3 py-10 text-center text-sm text-slate-400">{t("common.noMatches")}</div>
          )}
          {groups.map(({ g, rows }) => (
            <div key={g} className="mb-1 last:mb-0">
              <div className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {t(`palette.groups.${g}`)}
              </div>
              {rows.map(({ item, index }) => {
                const Icon = item.icon;
                const isActive = index === active;
                return (
                  <div
                    key={item.id}
                    id={`palette-item-${index}`}
                    data-index={index}
                    role="option"
                    aria-selected={isActive}
                    onMouseMove={() => setActive(index)}
                    onClick={() => item.run()}
                    className={clsx(
                      "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm",
                      isActive ? "bg-slate-800 text-slate-100" : "text-slate-300",
                    )}
                  >
                    <Icon className={clsx("w-4 h-4 shrink-0", isActive ? "text-brand-300" : "text-slate-500")} />
                    <span className="truncate">{item.label}</span>
                    {item.hint && (
                      <span className="ml-auto pl-3 truncate font-mono text-xs text-slate-500">{item.hint}</span>
                    )}
                    {isActive && !item.hint && <CornerDownLeft className="ml-auto w-3.5 h-3.5 text-slate-500" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-slate-800 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="kbd">↑</span>
            <span className="kbd">↓</span>
            {t("palette.navigate")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="kbd">Enter</span>
            {t("palette.select")}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
