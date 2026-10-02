"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Boxes,
  Image as ImageIcon,
  Database,
  Network,
  Settings,
  Hammer,
  Layers,
  Stethoscope,
} from "lucide-react";
import clsx from "clsx";
import { useT } from "@/i18n/provider";
import { RihtimLogo } from "./RihtimLogo";

const sections = [
  {
    key: "nav.section.overview",
    items: [{ href: "/", key: "nav.dashboard", icon: LayoutDashboard }],
  },
  {
    key: "nav.section.resources",
    items: [
      { href: "/containers", key: "nav.containers", icon: Boxes },
      { href: "/images", key: "nav.images", icon: ImageIcon },
      { href: "/builds", key: "nav.builds", icon: Hammer },
      { href: "/compose", key: "nav.compose", icon: Layers },
      { href: "/volumes", key: "nav.volumes", icon: Database },
      { href: "/networks", key: "nav.networks", icon: Network },
    ],
  },
  {
    key: "nav.section.system",
    items: [
      { href: "/diagnostics", key: "nav.diagnostics", icon: Stethoscope },
      { href: "/settings", key: "nav.settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const path = usePathname();
  const { t } = useT();
  return (
    <aside className="w-60 shrink-0 border-r border-slate-800 bg-slate-900 flex flex-col">
      <div className="h-16 flex items-center gap-2.5 px-5">
        <RihtimLogo className="w-7 h-7 rounded-md shadow-sm" />
        <div className="leading-tight">
          <div className="text-[15px] font-bold tracking-tight">Rihtim</div>
          <div className="text-[10.5px] text-slate-500">docker ui</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {sections.map((section) => (
          <div key={section.key}>
            <div className="px-3 pt-4 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              {t(section.key)}
            </div>
            <div className="space-y-0.5">
              {section.items.map(({ href, key, icon: Icon }) => {
                const active = href === "/" ? path === "/" : path?.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={clsx(
                      "flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-colors",
                      active
                        ? "bg-slate-800 text-brand-300"
                        : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-100",
                    )}
                  >
                    <Icon className="w-4 h-4" strokeWidth={1.75} />
                    {t(key)}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-5 py-3 text-[11px] text-slate-500 font-mono border-t border-slate-800">
        v0.1.0
      </div>
    </aside>
  );
}
